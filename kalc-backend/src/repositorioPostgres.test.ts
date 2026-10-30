import { describe, expect, it } from 'vitest'
import type { Variable } from 'kalc'
import type { ClientePostgres, PoolPostgres } from './postgres.ts'
import { aVariable, repositorioPostgres } from './repositorioPostgres.ts'

const A: Variable = { nombre: 'A', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 1 } } }
const B: Variable = { nombre: 'B', tipo: 'numero', origen: { clase: 'formula', texto: 'A*2' }, descripcion: 'El doble' }

type Consulta = string | { text: string; values?: unknown[] }
const texto = (q: Consulta) => (typeof q === 'string' ? q : q.text)

/** Pool falso: anota cada sentencia (su primera palabra) y si la conexión vuelve rota. */
function poolFalso(responder: (q: Consulta) => unknown[] = () => []) {
  const log: string[] = []
  const enviados: unknown[][] = []
  const cliente: ClientePostgres = {
    async query(q) {
      log.push(texto(q).split(' ')[0] ?? '')
      if (typeof q !== 'string' && q.values) enviados.push(q.values)
      return { rows: responder(q) }
    },
    release: (roto) => void log.push(roto ? 'release roto' : 'release'),
  }
  const pool: PoolPostgres = { connect: async () => cliente }
  return { pool, log, enviados }
}

describe('repositorioPostgres', () => {
  it('lista convirtiendo las filas, y descarta las rotas', async () => {
    const filas = [
      { nombre: 'A', tipo: 'numero', origen: JSON.stringify(A.origen), columnas: null, descripcion: null },
      { nombre: 'B', tipo: 'numero', origen: JSON.stringify(B.origen), columnas: null, descripcion: 'El doble' },
      { nombre: 'C', tipo: 'numero', origen: '{roto', columnas: null, descripcion: null },
      { nombre: 'D', tipo: 'moneda', origen: JSON.stringify(A.origen), columnas: null, descripcion: null },
    ]
    const { pool, log } = poolFalso((q) => (texto(q).startsWith('SELECT') ? filas : []))
    expect(await repositorioPostgres(pool).listar()).toEqual([A, B])
    expect(log).toEqual(['BEGIN', 'SELECT', 'COMMIT', 'release'])
  })

  it('guardar agrega o reemplaza con una sola sentencia, por el nombre sin distinguir mayúsculas', async () => {
    const consultas: string[] = []
    const { pool, log } = poolFalso((q) => (consultas.push(texto(q)), []))
    await repositorioPostgres(pool).guardar(A)
    expect(log).toEqual(['BEGIN', 'INSERT', 'COMMIT', 'release'])
    expect(consultas[1]).toContain('ON CONFLICT ((upper(nombre)))')
  })

  it('manda el origen como JSON y la descripción y las columnas ausentes como null', async () => {
    const { pool, enviados } = poolFalso()
    await repositorioPostgres(pool).guardar(A)
    expect(enviados[0]).toEqual(['A', 'numero', JSON.stringify(A.origen), null, null])
  })

  it('guarda y lee las columnas calculadas de una tabla', async () => {
    const T: Variable = {
      nombre: 'T',
      tipo: 'tabla',
      origen: { clase: 'datos', tabla: { columnas: ['A'], filas: [[{ tipo: 'numero', valor: 1 }]] } },
      columnas: [{ nombre: 'Doble', formula: '[@A] * 2' }],
    }
    const { pool, enviados } = poolFalso()
    await repositorioPostgres(pool).guardar(T)
    expect(enviados[0]?.[3]).toBe(JSON.stringify(T.columnas))
    expect(aVariable({ nombre: 'T', tipo: 'tabla', origen: JSON.stringify(T.origen), columnas: JSON.stringify(T.columnas), descripcion: null })).toEqual(T)
  })

  it('borrar no distingue mayúsculas', async () => {
    const consultas: string[] = []
    const { pool, enviados } = poolFalso((q) => (consultas.push(texto(q)), []))
    await repositorioPostgres(pool).borrar('a')
    expect(consultas[1]).toContain('upper(nombre) = upper($1)')
    expect(enviados[0]).toEqual(['a'])
  })

  it('reemplazarTodas es una transacción: si falla un insert, vuelve atrás', async () => {
    let inserts = 0
    const { pool, log } = poolFalso((q) => {
      if (texto(q).startsWith('INSERT') && ++inserts === 2) throw new Error('clave duplicada')
      return []
    })
    await expect(repositorioPostgres(pool).reemplazarTodas([A, B])).rejects.toThrow('clave duplicada')
    expect(log).toEqual(['BEGIN', 'DELETE', 'INSERT', 'INSERT', 'ROLLBACK', 'release'])
  })

  it('si se cortó la conexión, ROLLBACK falla y el pool la descarta', async () => {
    const { pool, log } = poolFalso((q) => {
      if (texto(q) !== 'BEGIN') throw new Error('se cortó')
      return []
    })
    await expect(repositorioPostgres(pool).listar()).rejects.toThrow('se cortó')
    expect(log.at(-1)).toBe('release roto')
  })

  it('aVariable no inventa la descripción', () => {
    expect(aVariable({ nombre: 'A', tipo: 'numero', origen: JSON.stringify(A.origen), columnas: null, descripcion: null })).toEqual(A)
  })
})

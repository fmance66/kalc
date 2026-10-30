import { describe, expect, it } from 'vitest'
import type { Variable } from 'kalc'
import { aVariable, repositorioOracle, type Conexion, type Pool } from './repositorioOracle.ts'

const A: Variable = { nombre: 'A', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 1 } } }
const B: Variable = { nombre: 'B', tipo: 'numero', origen: { clase: 'formula', texto: 'A*2' }, descripcion: 'El doble' }

type Respuesta = { rows?: unknown[]; rowsAffected?: number }

/** Pool falso: anota cada sentencia (su primera palabra) y cómo termina la transacción. */
function poolFalso(responder: (sql: string, binds: unknown) => Respuesta = () => ({})) {
  const log: string[] = []
  const conexion = {
    async execute(sql: string, binds?: unknown) {
      log.push(sql.split(' ')[0] ?? '')
      return responder(sql, binds)
    },
    commit: async () => void log.push('commit'),
    rollback: async () => void log.push('rollback'),
    close: async () => void log.push('close'),
  } as unknown as Conexion
  const pool: Pool = { getConnection: async () => conexion }
  return { pool, log }
}

describe('repositorioOracle', () => {
  it('lista convirtiendo las filas, y descarta las rotas', async () => {
    const filas = [
      { NOMBRE: 'A', TIPO: 'numero', ORIGEN: JSON.stringify(A.origen), COLUMNAS: null, DESCRIPCION: null },
      { NOMBRE: 'B', TIPO: 'numero', ORIGEN: JSON.stringify(B.origen), COLUMNAS: null, DESCRIPCION: 'El doble' },
      { NOMBRE: 'C', TIPO: 'numero', ORIGEN: '{roto', COLUMNAS: null, DESCRIPCION: null },
      { NOMBRE: 'D', TIPO: 'moneda', ORIGEN: JSON.stringify(A.origen), COLUMNAS: null, DESCRIPCION: null },
    ]
    const { pool, log } = poolFalso(() => ({ rows: filas }))
    expect(await repositorioOracle(pool).listar()).toEqual([A, B])
    expect(log).toEqual(['SELECT', 'commit', 'close'])
  })

  it('guardar actualiza; si no había, inserta', async () => {
    const existe = poolFalso(() => ({ rowsAffected: 1 }))
    await repositorioOracle(existe.pool).guardar(A)
    expect(existe.log).toEqual(['UPDATE', 'commit', 'close'])

    const nueva = poolFalso(() => ({ rowsAffected: 0 }))
    await repositorioOracle(nueva.pool).guardar(B)
    expect(nueva.log).toEqual(['UPDATE', 'INSERT', 'commit', 'close'])
  })

  it('manda el origen como JSON y la descripción ausente como null', async () => {
    const enviados: unknown[] = []
    const { pool } = poolFalso((_sql, binds) => {
      enviados.push(binds)
      return { rowsAffected: 1 }
    })
    await repositorioOracle(pool).guardar(A)
    expect(enviados[0]).toMatchObject({ nombre: 'A', tipo: 'numero', origen: { val: JSON.stringify(A.origen) }, columnas: { val: null }, descripcion: null })
  })

  it('guarda y lee las columnas calculadas de una tabla', async () => {
    const T: Variable = {
      nombre: 'T',
      tipo: 'tabla',
      origen: { clase: 'datos', tabla: { columnas: ['A'], filas: [[{ tipo: 'numero', valor: 1 }]] } },
      columnas: [{ nombre: 'Doble', formula: '[@A] * 2' }],
    }
    const enviados: unknown[] = []
    const { pool } = poolFalso((_sql, binds) => {
      enviados.push(binds)
      return { rowsAffected: 1 }
    })
    await repositorioOracle(pool).guardar(T)
    expect(enviados[0]).toMatchObject({ columnas: { val: JSON.stringify(T.columnas) } })
    expect(aVariable({ NOMBRE: 'T', TIPO: 'tabla', ORIGEN: JSON.stringify(T.origen), COLUMNAS: JSON.stringify(T.columnas), DESCRIPCION: null })).toEqual(T)
  })

  it('reemplazarTodas es una transacción: si falla un insert, vuelve atrás', async () => {
    let inserts = 0
    const { pool, log } = poolFalso((sql) => {
      if (sql.startsWith('INSERT') && ++inserts === 2) throw new Error('ORA-00001')
      return {}
    })
    await expect(repositorioOracle(pool).reemplazarTodas([A, B])).rejects.toThrow('ORA-00001')
    expect(log).toEqual(['DELETE', 'INSERT', 'INSERT', 'rollback', 'close'])
  })

  it('aVariable no inventa la descripción', () => {
    expect(aVariable({ NOMBRE: 'A', TIPO: 'numero', ORIGEN: JSON.stringify(A.origen), COLUMNAS: null, DESCRIPCION: null })).toEqual(A)
  })
})

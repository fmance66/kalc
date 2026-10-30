import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agregarFaltantes, cargarVariables, separarOcultas, catalogo, definirVariable, errorPersistencia, quitarVariable, reemplazarVariables, reintentar, sinVariablesGuardadas } from './catalogo.ts'
import type { RepositorioVariables, Variable } from 'kalc'

const numero = (nombre: string, valor: number): Variable => ({ nombre, tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor } } })

/** Repositorio en memoria que se puede "apagar" (como la API caída). */
function repoFalso(iniciales: Variable[] = []) {
  const estado = { variables: [...iniciales], apagado: false }
  const andar = () => {
    if (estado.apagado) throw new Error('No se pudo conectar con el servidor')
  }
  const repo: RepositorioVariables = {
    async listar() {
      andar()
      return [...estado.variables]
    },
    async guardar(v) {
      andar()
      estado.variables = [...estado.variables.filter((x) => x.nombre !== v.nombre), v]
    },
    async borrar(nombre) {
      andar()
      estado.variables = estado.variables.filter((x) => x.nombre !== nombre)
    },
    async reemplazarTodas(lista) {
      andar()
      estado.variables = [...lista]
    },
  }
  return { repo, estado }
}

// Los errores también van a la consola: en los tests, callados.
beforeEach(() => {
  errorPersistencia.value = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('agregarFaltantes', () => {
  it('agrega y guarda solo las que no están, sin distinguir mayúsculas, y no toca las que ya están', async () => {
    const { repo, estado } = repoFalso([numero('A', 1)])
    await cargarVariables(repo)
    expect(await agregarFaltantes([numero('a', 9), numero('B', 2), { nombre: 'C', tipo: 'numero', origen: { clase: 'formula', texto: 'A + B' } }])).toEqual(['B', 'C'])
    expect(estado.variables.map((v) => v.nombre)).toEqual(['A', 'B', 'C'])
    expect(catalogo.value.estado('C')?.valor).toEqual({ tipo: 'numero', valor: 3 })
    expect(await agregarFaltantes([numero('B', 5)])).toEqual([])
    expect(catalogo.value.estado('B')?.valor).toEqual({ tipo: 'numero', valor: 2 })
  })
})

describe('catálogo: errores del repositorio', () => {
  it('si un guardado falla, el cambio queda en pantalla y el error en errorPersistencia; reintentar guarda todas', async () => {
    const { repo, estado } = repoFalso([numero('A', 1)])
    await cargarVariables(repo)
    estado.apagado = true
    await definirVariable(numero('B', 2)) // no lanza
    expect(catalogo.value.buscar('B')).toBeTruthy()
    expect(errorPersistencia.value).toEqual({ al: 'guardar', mensaje: 'No se pudo conectar con el servidor' })

    await quitarVariable('A')
    expect(errorPersistencia.value?.al).toBe('guardar')

    estado.apagado = false
    await reintentar()
    expect(errorPersistencia.value).toBeNull()
    expect(estado.variables.map((v) => v.nombre)).toEqual(['B'])
  })

  it('un guardado que anda borra el error anterior', async () => {
    const { repo, estado } = repoFalso()
    await cargarVariables(repo)
    estado.apagado = true
    await reemplazarVariables([numero('A', 1)])
    expect(errorPersistencia.value?.al).toBe('guardar')
    estado.apagado = false
    await definirVariable(numero('B', 2))
    expect(errorPersistencia.value).toBeNull()
  })

  it('el nombre repetido sigue lanzando: es un error de validación, no de guardado', async () => {
    const { repo } = repoFalso([numero('A', 1), numero('B', 2)])
    await cargarVariables(repo)
    await expect(definirVariable(numero('a', 3), 'B')).rejects.toThrow('Ya existe una variable «a»')
    expect(errorPersistencia.value).toBeNull()
  })

  it('si la carga falla no lanza ni pregunta por las iniciales; reintentar vuelve a cargar, sin guardar nada', async () => {
    const { repo, estado } = repoFalso([numero('A', 1)])
    estado.apagado = true
    await cargarVariables(repo)
    expect(errorPersistencia.value?.al).toBe('cargar')
    expect(sinVariablesGuardadas.value).toBe(false)

    estado.apagado = false
    await reintentar()
    expect(errorPersistencia.value).toBeNull()
    expect(catalogo.value.variables().map((v) => v.nombre)).toEqual(['A'])
    expect(estado.variables).toHaveLength(1)
  })

  it('renombrar guarda de a una solo lo que cambió (la renombrada y las fórmulas que la usaban), sin reemplazar todas', async () => {
    const { repo, estado } = repoFalso([numero('Neto', 1), { nombre: 'Total', tipo: 'numero', origen: { clase: 'formula', texto: 'Neto*2' } }, numero('Otra', 3)])
    await cargarVariables(repo)
    const guardar = vi.spyOn(repo, 'guardar')
    const borrar = vi.spyOn(repo, 'borrar')
    const reemplazarTodas = vi.spyOn(repo, 'reemplazarTodas')
    await definirVariable(numero('Base', 1), 'Neto')
    expect(reemplazarTodas).not.toHaveBeenCalled()
    expect(borrar.mock.calls).toEqual([['Neto']])
    expect(guardar.mock.calls.map(([v]) => v.nombre).sort()).toEqual(['Base', 'Total'])
    expect(estado.variables.find((v) => v.nombre === 'Total')?.origen).toEqual({ clase: 'formula', texto: 'Base*2' })
  })
})

describe('ocultas: consultas a una conexión que el servidor no tiene', () => {
  const consulta = (nombre: string, conexion?: string): Variable => ({ nombre, tipo: 'numero', origen: { clase: 'consulta', sql: 'select 1 from dual', ...(conexion ? { conexion } : {}) } })
  const formula = (nombre: string, texto: string): Variable => ({ nombre, tipo: 'numero', origen: { clase: 'formula', texto } })
  const variables = [numero('Neto', 100), consulta('Cotización', 'local'), formula('Total', 'Neto / Cotización'), formula('Doble', 'Total * 2'), consulta('Estados', 'juzgado'), consulta('Sin conexión')]
  const sinConsultas: () => Promise<readonly string[] | null> = async () => ['juzgado']

  it('oculta las consultas a otra conexión y las fórmulas que las usan, también las indirectas', () => {
    const { visibles, ocultas } = separarOcultas(variables, ['juzgado'])
    expect(visibles.map((v) => v.nombre)).toEqual(['Neto', 'Estados', 'Sin conexión'])
    expect(ocultas.map((v) => v.nombre)).toEqual(['Cotización', 'Total', 'Doble'])
  })

  it('sin conexiones (desarrollo, o el servidor no responde) no oculta nada', () => {
    expect(separarOcultas(variables, null).ocultas).toEqual([])
  })

  it('reemplazar todas conserva las ocultas en la base', async () => {
    const { repo, estado } = repoFalso(variables)
    await cargarVariables(repo, async () => ({ tipo: 'numero', valor: 1 }), sinConsultas)
    expect(catalogo.value.buscar('Cotización')).toBeUndefined()
    await reemplazarVariables([numero('Neto', 5)])
    expect(estado.variables.map((v) => v.nombre).sort()).toEqual(['Cotización', 'Doble', 'Neto', 'Total'])
  })

  it('no deja crear una con el nombre de una oculta: la pisaría en la base', async () => {
    const { repo } = repoFalso(variables)
    await cargarVariables(repo, async () => ({ tipo: 'numero', valor: 1 }), sinConsultas)
    await expect(definirVariable(numero('total', 1))).rejects.toThrow(/Ya existe una variable «total»/)
  })
})

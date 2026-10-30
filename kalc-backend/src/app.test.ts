import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { ErrorConsulta, VACIO, type RepositorioVariables, type Tabla, type Variable } from 'kalc'
import { crearApp } from './app.ts'
import type { InfoVersion } from './version.ts'

const A: Variable = { nombre: 'A', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 1 } } }
const B: Variable = { nombre: 'B', tipo: 'numero', origen: { clase: 'formula', texto: 'A*2' }, descripcion: 'El doble' }

/** Repositorio en memoria que anota las llamadas. */
function enMemoria(iniciales: Variable[] = []) {
  let variables = [...iniciales]
  const llamadas: string[] = []
  const repo: RepositorioVariables = {
    listar: async () => variables,
    async guardar(v) {
      llamadas.push(`guardar ${v.nombre}`)
      variables = [...variables.filter((x) => x.nombre.toLowerCase() !== v.nombre.toLowerCase()), v]
    },
    async borrar(nombre) {
      llamadas.push(`borrar ${nombre}`)
      variables = variables.filter((x) => x.nombre.toLowerCase() !== nombre.toLowerCase())
    },
    async reemplazarTodas(lista) {
      llamadas.push(`reemplazar ${lista.length}`)
      variables = [...lista]
    },
  }
  return { repo, llamadas }
}

let servidor: Server | undefined
afterEach(() => {
  servidor?.close()
})

/** Levanta la app en un puerto libre y devuelve cómo pedirle. */
async function levantar(repo: RepositorioVariables, version?: InfoVersion) {
  const s = crearApp(repo, undefined, version).listen(0)
  servidor = s
  await new Promise((listo) => s.once('listening', listo))
  const { port } = s.address() as AddressInfo
  return (ruta: string, metodo = 'GET', cuerpo?: unknown) =>
    fetch(`http://localhost:${port}${ruta}`, {
      method: metodo,
      ...(cuerpo === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }),
    })
}

describe('API de variables', () => {
  it('GET /api/version dice qué versión corre, sin caché; sin los datos, 404', async () => {
    const version: InfoVersion = { version: '1.0.0', commit: '1edbbbc0', fecha: '14/10/2026', kalc: '1.4.0' }
    const r = await (await levantar(enMemoria().repo, version))('/api/version')
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.json()).toEqual(version)
    servidor?.close()
    expect((await (await levantar(enMemoria().repo))('/api/version')).status).toBe(404)
  })

  it('lista, guarda, borra y reemplaza', async () => {
    const { repo, llamadas } = enMemoria([A])
    const pedir = await levantar(repo)
    expect(await (await pedir('/api/variables')).json()).toEqual([A])
    expect((await pedir('/api/variables/b', 'PUT', B)).status).toBe(204)
    expect((await pedir('/api/variables/Base%20imponible', 'PUT', { ...A, nombre: 'Base imponible' })).status).toBe(204)
    expect((await pedir('/api/variables/a', 'DELETE')).status).toBe(204)
    expect((await pedir('/api/variables', 'PUT', [A, B])).status).toBe(204)
    expect(llamadas).toEqual(['guardar B', 'guardar Base imponible', 'borrar a', 'reemplazar 2'])
  })

  it('las respuestas de la API no se guardan en caché (el ARR del IIS las guardaba)', async () => {
    const pedir = await levantar(enMemoria([A]).repo)
    expect((await pedir('/api/variables')).headers.get('cache-control')).toBe('no-store')
  })

  it('rechaza lo que no es una variable válida', async () => {
    const { repo, llamadas } = enMemoria()
    const pedir = await levantar(repo)
    const original = console.error
    console.error = () => {}
    try {
      expect((await pedir('/api/variables/A', 'PUT', { nombre: 'A' })).status).toBe(400)
      expect((await pedir('/api/variables/A1', 'PUT', { ...A, nombre: 'A1' })).status).toBe(400) // parece celda
      expect((await pedir('/api/variables/X', 'PUT', A)).status).toBe(400) // otro nombre que la ruta
      expect((await pedir('/api/variables', 'PUT', [A, { ...B, nombre: 'a' }])).status).toBe(400) // repetidas
      expect((await pedir('/api/variables', 'PUT', { variables: [A] })).status).toBe(400)
      expect((await pedir('/api/variables', 'PUT', '{roto')).status).toBe(400)
    } finally {
      console.error = original
    }
    expect(llamadas).toEqual([])
  })

  it('un error del repositorio da 500 sin el detalle', async () => {
    const { repo } = enMemoria()
    repo.listar = async () => {
      throw new Error('ORA-12541: no listener en 192.0.2.1')
    }
    const pedir = await levantar(repo)
    const original = console.error
    console.error = () => {}
    try {
      const r = await pedir('/api/variables')
      expect(r.status).toBe(500)
      expect(await r.json()).toEqual({ error: 'Error interno del servidor' })
    } finally {
      console.error = original
    }
  })
})

describe('GET /api/conexiones', () => {
  it('da los nombres de las conexiones de consultas; la primera es la de por defecto', async () => {
    const s = crearApp(enMemoria().repo, async () => VACIO, undefined, ['juzgado', 'reportes']).listen(0)
    servidor = s
    await new Promise((listo) => s.once('listening', listo))
    const r = await fetch(`http://localhost:${(s.address() as AddressInfo).port}/api/conexiones`)
    expect(await r.json()).toEqual({ conexiones: ['juzgado', 'reportes'], porDefecto: 'juzgado' })
  })

  it('sin conexiones, la lista vacía', async () => {
    expect(await (await (await levantar(enMemoria().repo))('/api/conexiones')).json()).toEqual({ conexiones: [], porDefecto: null })
  })
})

describe('consultas', () => {
  const Q: Variable = { nombre: 'Sueldo', tipo: 'numero', origen: { clase: 'consulta', sql: 'select salary from employees where employee_id = :Empleado;' } }
  const T: Variable = { nombre: 'Ventas', tipo: 'tabla', origen: { clase: 'consulta', sql: 'select x from ventas' } }

  const S: Variable = { nombre: 'Aportes', tipo: 'numero', origen: { clase: 'consulta', sql: 'select 1 from dual', conexion: 'Reportes' } }

  async function levantarConsultas(ejecutar?: Parameters<typeof crearApp>[1], conexiones?: string[]) {
    const s = crearApp(enMemoria([A, Q, T, S]).repo, ejecutar, undefined, conexiones).listen(0)
    servidor = s
    await new Promise((listo) => s.once('listening', listo))
    const { port } = s.address() as AddressInfo
    return (nombre: string, cuerpo: unknown) =>
      fetch(`http://localhost:${port}/api/consultas/${nombre}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  }

  it('corre el SQL guardado (no uno que llegue), con los parámetros que nombra', async () => {
    const recibidos: unknown[] = []
    const pedir = await levantarConsultas(async (sql, parametros) => {
      recibidos.push({ sql, parametros })
      return { tipo: 'numero', valor: 6500 }
    })
    const r = await pedir('sueldo', { sql: 'delete from employees', parametros: { empleado: { tipo: 'numero', valor: 208 }, otro: 1 } })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ valor: { tipo: 'numero', valor: 6500 } })
    expect(recibidos).toEqual([{ sql: 'select salary from employees where employee_id = :Empleado', parametros: { Empleado: { tipo: 'numero', valor: 208 } } }])
  })

  it('una de tipo tabla pide las filas y las devuelve como tabla', async () => {
    const tabla = { columnas: ['X'], filas: [[{ tipo: 'numero', valor: 1 }], [{ tipo: 'vacio' }]] }
    const opciones: unknown[] = []
    const pedir = await levantarConsultas(async (_sql, _parametros, o) => {
      opciones.push(o)
      return tabla as Tabla
    })
    const r = await pedir('Ventas', { parametros: {} })
    expect(await r.json()).toEqual({ tabla })
    expect(opciones).toEqual([{ tabla: true }])
  })

  it('corre en la conexión que dice la variable o, si no dice, en la de por defecto', async () => {
    const opciones: unknown[] = []
    const pedir = await levantarConsultas(async (_sql, _parametros, o) => {
      opciones.push(o)
      return VACIO
    }, ['juzgado', 'reportes'])
    expect((await pedir('Aportes', { parametros: {} })).status).toBe(200)
    expect((await pedir('Ventas', { parametros: {} })).status).toBe(200)
    expect(opciones).toEqual([
      { tabla: false, conexion: 'reportes' },
      { tabla: true, conexion: 'juzgado' },
    ])
  })

  it('una conexión que el servidor no tiene es un error de la consulta, con las que hay', async () => {
    let corrio = false
    const pedir = await levantarConsultas(async () => {
      corrio = true
      return VACIO
    }, ['juzgado'])
    const r = await pedir('Aportes', { parametros: {} })
    expect(r.status).toBe(422)
    expect(await r.json()).toEqual({ error: 'La conexión Reportes no está configurada en el servidor: hay juzgado', codigo: '#¡VALOR!' })
    expect(corrio).toBe(false)
  })

  it('rechaza lo que no se puede correr', async () => {
    const pedir = await levantarConsultas(async () => VACIO)
    expect((await pedir('A', { parametros: {} })).status).toBe(404) // no es de consulta
    expect((await pedir('Nada', { parametros: {} })).status).toBe(404)
    expect((await pedir('Sueldo', { parametros: {} })).status).toBe(400) // falta el parámetro
    expect((await pedir('Sueldo', { parametros: { Empleado: 208 } })).status).toBe(400) // no es un valor
  })

  it('un error de la consulta vuelve con su código y el mensaje de Oracle', async () => {
    const original = console.error
    console.error = () => {}
    try {
      const pedir = await levantarConsultas(async () => {
        throw new Error('ORA-00942: table or view does not exist\nHelp: https://docs.oracle.com/error-help/db/ora-00942/')
      })
      const r = await pedir('Sueldo', { parametros: { Empleado: { tipo: 'numero', valor: 208 } } })
      expect(r.status).toBe(422)
      expect(await r.json()).toEqual({ error: 'ORA-00942: table or view does not exist', codigo: '#¡VALOR!' })
      const sinFilas = await levantarConsultas(async () => {
        throw new ErrorConsulta('#N/D', 'La consulta no devolvió filas')
      })
      expect(await (await sinFilas('Sueldo', { parametros: { Empleado: { tipo: 'numero', valor: 1 } } })).json()).toEqual({ error: 'La consulta no devolvió filas', codigo: '#N/D' })
    } finally {
      console.error = original
    }
  })
})

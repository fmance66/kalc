import { describe, expect, it } from 'vitest'
import type { Variable } from 'kalc'
import { ejecutorApi, leerConexionesApi, leerVersionApi, repositorioApi, textoVersionApi } from './api.ts'

const A: Variable = { nombre: 'A', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 1 } } }

/** fetch falso: anota método, URL y cuerpo, y responde lo que se le diga. */
function fetchFalso(respuesta: () => Response = () => new Response(null, { status: 204 })) {
  const pedidos: string[] = []
  const pedir = (async (url: string, init?: RequestInit) => {
    pedidos.push(`${init?.method} ${url}` + (init?.body ? ` ${String(init.body)}` : ''))
    return respuesta()
  }) as typeof fetch
  return { pedir, pedidos }
}

describe('repositorioApi', () => {
  it('cada operación es un pedido a la API', async () => {
    const { pedir, pedidos } = fetchFalso()
    const r = repositorioApi('/api', pedir)
    await r.guardar({ ...A, nombre: 'Base imponible' })
    await r.borrar('Base imponible')
    await r.reemplazarTodas([A])
    expect(pedidos).toEqual([
      `PUT /api/variables/Base%20imponible ${JSON.stringify({ ...A, nombre: 'Base imponible' })}`,
      'DELETE /api/variables/Base%20imponible',
      `PUT /api/variables ${JSON.stringify([A])}`,
    ])
  })

  it('lista descartando lo que no es una variable', async () => {
    const { pedir } = fetchFalso(() => Response.json([A, { nombre: 'X' }]))
    expect(await repositorioApi('/api', pedir).listar()).toEqual([A])
  })

  it('si la API falla, lanza un error con el detalle', async () => {
    const { pedir } = fetchFalso(() => Response.json({ error: 'Hay nombres repetidos' }, { status: 400 }))
    await expect(repositorioApi('/api', pedir).reemplazarTodas([A, A])).rejects.toThrow('El servidor respondió 400: Hay nombres repetidos')
  })

  it('sin respuesta (servidor apagado) lo dice', async () => {
    const pedir = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    await expect(repositorioApi('/api', pedir).listar()).rejects.toThrow('No se pudo conectar con el servidor')
  })
})

describe('ejecutorApi', () => {
  const consulta = { nombre: 'Sueldo', sql: 'select salary from employees where employee_id = :Empleado', parametros: { Empleado: { tipo: 'numero' as const, valor: 208 } } }
  const json = (cuerpo: unknown, status = 200) => () => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

  it('manda el nombre y los parámetros (no el SQL) y devuelve el valor', async () => {
    const { pedir, pedidos } = fetchFalso(json({ valor: { tipo: 'numero', valor: 6500 } }))
    expect(await ejecutorApi('/api', pedir)(consulta)).toEqual({ tipo: 'numero', valor: 6500 })
    expect(pedidos).toEqual([`POST /api/consultas/Sueldo ${JSON.stringify({ parametros: consulta.parametros })}`])
  })

  it('de una variable de tipo tabla devuelve la tabla', async () => {
    const tabla = { columnas: ['X'], filas: [[{ tipo: 'numero', valor: 1 }]] }
    const { pedir } = fetchFalso(json({ tabla }))
    expect(await ejecutorApi('/api', pedir)({ ...consulta, tabla: true })).toEqual(tabla)
    // Una tabla mal formada no se acepta.
    const { pedir: roto } = fetchFalso(json({ tabla: { columnas: ['X'], filas: [[1]] } }))
    await expect(ejecutorApi('/api', roto)(consulta)).rejects.toThrow('El servidor respondió 200')
  })

  it('un error de la consulta vuelve como ErrorConsulta con su código', async () => {
    const { pedir } = fetchFalso(json({ error: 'La consulta no devolvió filas', codigo: '#N/D' }, 422))
    await expect(ejecutorApi('/api', pedir)(consulta)).rejects.toMatchObject({ name: 'ErrorConsulta', codigo: '#N/D', message: 'La consulta no devolvió filas' })
  })

  it('sin servidor lo dice', async () => {
    const pedir = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    await expect(ejecutorApi('/api', pedir)(consulta)).rejects.toThrow('No se pudo conectar con el servidor')
  })
})

describe('leerVersionApi', () => {
  it('lee GET /version y la arma como la de la app', async () => {
    const { pedir, pedidos } = fetchFalso(() => Response.json({ version: '1.0.0', commit: '1edbbbc0', fecha: '14/10/2026', kalc: '1.4.0' }))
    const v = await leerVersionApi('/kalc/api', pedir)
    expect(pedidos).toEqual(['undefined /kalc/api/version'])
    expect(v).toEqual({ version: '1.0.0', commit: '1edbbbc0', fecha: '14/10/2026', kalc: '1.4.0' })
    expect(textoVersionApi(v!)).toBe('API v1.0.0 · 1edbbbc0 del 14/10/2026')
    expect(textoVersionApi({ version: '1.0.0', commit: '776001e0+cambios', fecha: null, kalc: null })).toBe('API v1.0.0 · 776001e0+cambios')
  })

  it('sin respuesta, o un backend sin la ruta (404), da null: el pie queda con la versión de la app', async () => {
    expect(await leerVersionApi('/api', fetchFalso(() => Response.json({ error: 'x' }, { status: 404 })).pedir)).toBeNull()
    const caido = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    expect(await leerVersionApi('/api', caido)).toBeNull()
  })
})

describe('leerConexionesApi', () => {
  it('lee GET /conexiones', async () => {
    const { pedir, pedidos } = fetchFalso(() => Response.json({ conexiones: ['juzgado', 'reportes'], porDefecto: 'juzgado' }))
    expect(await leerConexionesApi('/kalc/api', pedir)).toEqual({ conexiones: ['juzgado', 'reportes'], porDefecto: 'juzgado' })
    expect(pedidos).toEqual(['undefined /kalc/api/conexiones'])
  })

  it('sin respuesta, un backend sin la ruta (404) o algo que no es la lista, da null: no se ofrece elegir', async () => {
    expect(await leerConexionesApi('/api', fetchFalso(() => Response.json({ error: 'x' }, { status: 404 })).pedir)).toBeNull()
    expect(await leerConexionesApi('/api', fetchFalso(() => Response.json({ conexiones: [1] })).pedir)).toBeNull()
    const caido = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    expect(await leerConexionesApi('/api', caido)).toBeNull()
  })
})

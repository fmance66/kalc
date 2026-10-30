import { describe, expect, it } from 'vitest'
import { codigoSql, ErrorConsulta, parametrosConsulta, sirveComoParametro, type Consulta, type EjecutorConsultas } from './consultas.ts'
import type { Tabla } from './tablas.ts'
import { formatear, numero, texto, VACIO, type Valor } from './valores.ts'
import { crearCatalogo, esTabla, esVariable, leerConstante, type TipoVariable, type Variable } from './variables.ts'

const constante = (nombre: string, valor: Valor, tipo: TipoVariable = 'numero'): Variable => ({ nombre, tipo, origen: { clase: 'constante', valor } })
const formula = (nombre: string, texto: string, tipo: TipoVariable = 'numero'): Variable => ({ nombre, tipo, origen: { clase: 'formula', texto } })
const consulta = (nombre: string, sql: string, tipo: TipoVariable = 'numero'): Variable => ({ nombre, tipo, origen: { clase: 'consulta', sql } })

const ver = (c: ReturnType<typeof crearCatalogo>, nombre: string) => {
  const e = c.estado(nombre)
  return e ? formatear(e.valor) : undefined
}

/** Un ejecutor falso: cada SQL tiene su respuesta, y anota las consultas que recibió. */
function ejecutorFalso(respuestas: Record<string, (p: Record<string, Valor>) => Valor>) {
  const recibidas: Consulta[] = []
  const ejecutor: EjecutorConsultas = async (c) => {
    recibidas.push(c)
    const r = respuestas[c.sql]
    if (!r) throw new Error('ORA-00942: table or view does not exist')
    return r(c.parametros)
  }
  return { ejecutor, recibidas }
}

describe('parametrosConsulta', () => {
  it.each<[string, string[]]>([
    ['select tope from topes', []],
    ['select alicuota from alicuotas where actividad = :Actividad', ['Actividad']],
    ['select x from t where a = :A_1 and b between :desde and :hasta', ['A_1', 'desde', 'hasta']],
    ['select x from t where a = :Año', ['Año']],
    // Adentro de textos, identificadores entre comillas y comentarios no son parámetros.
    ["select to_char(sysdate, 'HH24:MI') from dual where a = :A", ['A']],
    ["select 'dijo '':hola''' from dual", []],
    ["select q'[a :b 'c']' from dual where x = :X", ['X']],
    ["select q'!a :b!' from dual", []],
    ['select ":raro" from dual', []],
    ['select 1 from dual -- :comentario\nwhere a = :A', ['A']],
    ['select 1 /* :otro */ from dual', []],
    // :1 es un bind por posición: no es una variable.
    ['select 1 from dual where a = :1', []],
    // :: es una conversión de PostgreSQL; un parámetro se puede convertir igual.
    ['select x::int from t where d = :Desde::date', ['Desde']],
  ])('%s', (sql, esperado) => {
    expect(parametrosConsulta(sql).map((p) => p.nombre)).toEqual(esperado)
  })

  it('codigoSql tapa textos y comentarios, en las mismas posiciones', () => {
    const sql = "select 'a;b' from dual -- ;\nwhere x = 1"
    expect(codigoSql(sql)).toBe('select       from dual     \nwhere x = 1')
  })

  it('da la posición, con los dos puntos', () => {
    expect(parametrosConsulta('where a = :Alicuota')).toEqual([{ nombre: 'Alicuota', inicio: 10, fin: 19 }])
  })

  it.each([
    ['Actividad', true],
    ['base_imponible', true],
    ['Base imponible', false],
    ['año.2026', false],
    ['_x', false],
  ])('sirveComoParametro(%s) → %s', (nombre, esperado) => {
    expect(sirveComoParametro(nombre)).toBe(esperado)
  })
})

describe('variables de consulta', () => {
  it('quedan pendientes (#N/D) hasta que se resuelven', async () => {
    const c = crearCatalogo([consulta('Tope', 'select tope from topes'), formula('Doble', 'Tope * 2')])
    expect(ver(c, 'Tope')).toBe('#N/D')
    expect(c.estado('Tope')?.problema).toEqual({ clase: 'pendiente' })
    expect(ver(c, 'Doble')).toBe('#N/D')

    const { ejecutor } = ejecutorFalso({ 'select tope from topes': () => numero(1000) })
    expect(await c.resolverConsultas(ejecutor)).toEqual(['Tope', 'Doble'])
    expect(ver(c, 'Tope')).toBe('1000')
    expect(c.estado('Tope')?.problema).toBeUndefined()
    expect(ver(c, 'Doble')).toBe('2000')
  })

  it('reciben sus parámetros y se vuelven a correr solo si cambian', async () => {
    const sql = 'select alicuota from alicuotas where actividad = :actividad'
    const c = crearCatalogo([constante('Actividad', texto('620100'), 'texto'), consulta('Alicuota', sql)])
    expect(c.estado('Alicuota')?.dependencias).toEqual(['actividad'])
    const { ejecutor, recibidas } = ejecutorFalso({ [sql]: (p) => numero(p['actividad']?.tipo === 'texto' && p['actividad'].valor === '620100' ? 0.035 : 0.05) })

    await c.resolverConsultas(ejecutor)
    expect(recibidas).toEqual([{ nombre: 'Alicuota', sql, parametros: { actividad: texto('620100') } }])
    expect(ver(c, 'Alicuota')).toBe('0,035')

    // Sin cambios no hay nada que correr.
    await c.resolverConsultas(ejecutor)
    expect(recibidas).toHaveLength(1)

    c.definir(constante('Actividad', texto('471100'), 'texto'))
    expect(c.estado('Alicuota')?.problema).toEqual({ clase: 'pendiente' })
    await c.resolverConsultas(ejecutor)
    expect(recibidas).toHaveLength(2)
    expect(ver(c, 'Alicuota')).toBe('0,05')

    // Vuelve al valor de antes: se corre de nuevo (solo se guarda el último resultado).
    c.definir(constante('Actividad', texto('620100'), 'texto'))
    await c.resolverConsultas(ejecutor)
    expect(recibidas).toHaveLength(3)
  })

  it('una consulta que usa otra espera a la primera (por tandas)', async () => {
    const c = crearCatalogo([
      consulta('Categoria', 'select categoria from contribuyentes'),
      formula('Siguiente', 'Categoria + 1'),
      consulta('Tope', 'select tope from topes where categoria = :Siguiente'),
    ])
    expect(c.estado('Tope')?.problema).toEqual({ clase: 'pendiente' })
    const { ejecutor, recibidas } = ejecutorFalso({
      'select categoria from contribuyentes': () => numero(3),
      'select tope from topes where categoria = :Siguiente': (p) => numero(p['Siguiente']?.tipo === 'numero' ? p['Siguiente'].valor * 1000 : -1),
    })
    await c.resolverConsultas(ejecutor)
    expect(recibidas.map((r) => r.nombre)).toEqual(['Categoria', 'Tope'])
    expect(ver(c, 'Tope')).toBe('4000')
  })

  it('un parámetro con error no va a la base: la consulta da ese error', async () => {
    const c = crearCatalogo([formula('X', '1/0'), consulta('Q', 'select 1 from dual where a = :X')])
    expect(ver(c, 'Q')).toBe('#¡DIV/0!')
    const { ejecutor, recibidas } = ejecutorFalso({})
    await c.resolverConsultas(ejecutor)
    expect(recibidas).toHaveLength(0)
  })

  it('un parámetro que no existe da #¿NOMBRE?', () => {
    const c = crearCatalogo([consulta('Q', 'select 1 from dual where a = :NoExiste')])
    expect(ver(c, 'Q')).toBe('#¿NOMBRE?')
    expect(c.estado('Q')?.problema).toEqual({ clase: 'faltan', nombres: ['NoExiste'] })
  })

  it('si el ejecutor falla, #¡VALOR! (o el código del ErrorConsulta) con el motivo', async () => {
    const c = crearCatalogo([consulta('Mala', 'select x from no_existe'), consulta('Vacia', 'select x from t where 1 = 0')])
    const { ejecutor } = ejecutorFalso({
      'select x from t where 1 = 0': () => {
        throw new ErrorConsulta('#N/D', 'La consulta no devolvió filas')
      },
    })
    await c.resolverConsultas(ejecutor)
    expect(ver(c, 'Mala')).toBe('#¡VALOR!')
    expect(c.estado('Mala')?.problema).toEqual({ clase: 'consulta', mensaje: 'ORA-00942: table or view does not exist' })
    expect(ver(c, 'Vacia')).toBe('#N/D')
    expect(c.estado('Vacia')?.problema).toEqual({ clase: 'consulta', mensaje: 'La consulta no devolvió filas' })
  })

  it('el tipo declarado se valida igual que en una fórmula', async () => {
    const c = crearCatalogo([consulta('Q', 'select nombre from t')])
    await c.resolverConsultas(ejecutorFalso({ 'select nombre from t': () => texto('Juan') }).ejecutor)
    expect(c.estado('Q')?.problema).toEqual({ clase: 'tipo', mensaje: 'Da un texto y se declaró número' })
  })

  it('NULL es vacío: vale 0 en una cuenta', async () => {
    const c = crearCatalogo([consulta('Q', 'select null from dual'), formula('F', 'Q + 1')])
    await c.resolverConsultas(ejecutorFalso({ 'select null from dual': () => VACIO }).ejecutor)
    expect(ver(c, 'F')).toBe('1')
  })

  it('con refrescar se vuelven a correr aunque ya tengan resultado', async () => {
    let tope = 1000
    const c = crearCatalogo([consulta('Tope', 'select tope from topes'), formula('Doble', 'Tope * 2')])
    const { ejecutor, recibidas } = ejecutorFalso({ 'select tope from topes': () => numero(tope) })
    await c.resolverConsultas(ejecutor)
    tope = 1500
    await c.resolverConsultas(ejecutor)
    expect(ver(c, 'Doble')).toBe('2000')
    await c.resolverConsultas(ejecutor, { refrescar: true })
    expect(recibidas).toHaveLength(2)
    expect(ver(c, 'Doble')).toBe('3000')
  })

  it('refrescar puede ser solo algunas', async () => {
    const c = crearCatalogo([consulta('A', 'select 1 from dual'), consulta('B', 'select 2 from dual')])
    const { ejecutor, recibidas } = ejecutorFalso({ 'select 1 from dual': () => numero(1), 'select 2 from dual': () => numero(2) })
    await c.resolverConsultas(ejecutor)
    await c.resolverConsultas(ejecutor, { refrescar: ['b'] })
    expect(recibidas.map((r) => r.nombre)).toEqual(['A', 'B', 'B'])
  })

  it('cambiar la descripción o el tipo no obliga a correrla de nuevo; cambiar el SQL sí', async () => {
    const c = crearCatalogo([consulta('Q', 'select 1 from dual')])
    await c.resolverConsultas(ejecutorFalso({ 'select 1 from dual': () => numero(1) }).ejecutor)
    c.definir({ ...consulta('Q', 'select 1 from dual', 'entero'), descripcion: 'Uno' })
    expect(ver(c, 'Q')).toBe('1')
    c.definir(consulta('Q', 'select 2 from dual'))
    expect(c.estado('Q')?.problema).toEqual({ clase: 'pendiente' })
  })

  it('si la redefinen mientras corre, el resultado viejo se descarta', async () => {
    const c = crearCatalogo([consulta('Q', 'select 1 from dual')])
    let soltar = () => {}
    const promesa = c.resolverConsultas(async ({ sql }) => {
      if (sql === 'select 1 from dual') await new Promise<void>((r) => (soltar = r))
      return numero(sql === 'select 1 from dual' ? 1 : 2)
    })
    c.definir(consulta('Q', 'select 2 from dual'))
    soltar()
    await promesa
    // La tanda siguiente corre la nueva.
    expect(ver(c, 'Q')).toBe('2')
  })

  it('los ciclos con consultas se detectan y no se corren', async () => {
    const c = crearCatalogo([consulta('Q', 'select 1 from dual where a = :F'), formula('F', 'Q + 1')])
    expect(ver(c, 'Q')).toBe('#¡CICLO!')
    expect(c.estado('Q')?.problema).toEqual({ clase: 'ciclo', camino: ['Q', 'F', 'Q'] })
    const { ejecutor, recibidas } = ejecutorFalso({})
    await c.resolverConsultas(ejecutor)
    expect(recibidas).toHaveLength(0)
  })

  it('el ejecutor recibe la conexión de la variable, si la tiene', async () => {
    const c = crearCatalogo([{ ...consulta('A', 'select 1 from dual'), origen: { clase: 'consulta', sql: 'select 1 from dual', conexion: 'reportes' } }, consulta('B', 'select 2 from dual')])
    const { ejecutor, recibidas } = ejecutorFalso({ 'select 1 from dual': () => numero(1), 'select 2 from dual': () => numero(2) })
    await c.resolverConsultas(ejecutor)
    expect(recibidas.map((r) => r.conexion)).toEqual(['reportes', undefined])
    expect(recibidas[1]).not.toHaveProperty('conexion')
  })

  it('cambiar la conexión obliga a correrla de nuevo: es otra base', async () => {
    const c = crearCatalogo([consulta('Q', 'select 1 from dual')])
    await c.resolverConsultas(ejecutorFalso({ 'select 1 from dual': () => numero(1) }).ejecutor)
    c.definir({ ...consulta('Q', 'select 1 from dual'), origen: { clase: 'consulta', sql: 'select 1 from dual', conexion: 'reportes' } })
    expect(c.estado('Q')?.problema).toEqual({ clase: 'pendiente' })
  })

  it('renombrar un parámetro conserva la conexión de la consulta', () => {
    const c = crearCatalogo([constante('Act', texto('620100'), 'texto'), { ...consulta('Q', 'select x from t where a = :Act'), origen: { clase: 'consulta', sql: 'select x from t where a = :Act', conexion: 'reportes' } }])
    c.renombrar('Act', 'Actividad')
    expect(c.buscar('Q')?.origen).toEqual({ clase: 'consulta', sql: 'select x from t where a = :Actividad', conexion: 'reportes' })
  })

  it('renombrar una variable corrige el SQL que la usa y conserva el resultado', async () => {
    const c = crearCatalogo([constante('Act', texto('620100'), 'texto'), consulta('Q', "select x from t where a = :act and b = ':act'")])
    await c.resolverConsultas(async () => numero(7))
    c.renombrar('Act', 'Actividad')
    expect(c.buscar('Q')?.origen).toEqual({ clase: 'consulta', sql: "select x from t where a = :Actividad and b = ':act'" })
    expect(ver(c, 'Q')).toBe('7')
    expect(() => c.renombrar('Actividad', 'Código de actividad')).toThrow('no sirve como parámetro de la consulta de «Q»')
  })

  it('esVariable acepta las de consulta', () => {
    expect(esVariable(consulta('Q', 'select 1 from dual'))).toBe(true)
    expect(esVariable({ nombre: 'Q', tipo: 'numero', origen: { clase: 'consulta' } })).toBe(false)
    expect(esVariable({ nombre: 'Q', tipo: 'numero', origen: { clase: 'consulta', sql: 'select 1 from dual', conexion: 'reportes' } })).toBe(true)
    expect(esVariable({ nombre: 'Q', tipo: 'numero', origen: { clase: 'consulta', sql: 'select 1 from dual', conexion: 1 } })).toBe(false)
  })
})

describe('consultas de tipo tabla', () => {
  const VENTAS: Tabla = {
    columnas: ['PRODUCTO', 'IMPORTE'],
    filas: [
      [texto('Yerba'), numero(100)],
      [texto('Café'), numero(250)],
      [texto('Yerba'), numero(50)],
    ],
  }
  const SQL = 'select producto, importe from ventas'

  it('traen todas las filas; las fórmulas usan sus columnas', async () => {
    const c = crearCatalogo([
      consulta('Ventas', SQL, 'tabla'),
      formula('Total', 'SUMA(Ventas[Importe])'),
      formula('Yerba', 'SUMAR.SI(Ventas[producto]; "Yerba"; Ventas[Importe])'),
    ])
    expect(ver(c, 'Total')).toBe('#N/D')
    expect(c.estado('Total')?.problema).toEqual({ clase: 'pendiente' })

    const recibidas: unknown[] = []
    await c.resolverConsultas(async (q) => {
      recibidas.push(q.tabla)
      return VENTAS
    })
    expect(recibidas).toEqual([true])
    expect(c.estado('Ventas')).toEqual({ valor: { tipo: 'error', valor: '#¡VALOR!' }, tabla: VENTAS, dependencias: [] })
    expect(ver(c, 'Total')).toBe('400')
    expect(ver(c, 'Yerba')).toBe('150')
  })

  it('una consulta de un valor que devuelve una tabla: sirve si es una celda; si no, lo explica', async () => {
    const c = crearCatalogo([consulta('Uno', 'select 1 from dual'), consulta('Varios', SQL)])
    await c.resolverConsultas(async ({ sql }) => (sql === SQL ? VENTAS : { columnas: ['X'], filas: [[numero(1)]] }))
    expect(ver(c, 'Uno')).toBe('1')
    expect(c.estado('Uno')?.problema).toBeUndefined()
    expect(ver(c, 'Varios')).toBe('#¡VALOR!')
    expect(c.estado('Varios')?.problema).toEqual({
      clase: 'consulta',
      mensaje: 'La consulta devolvió 3 filas y 2 columnas; para usarlas todas, declarala de tipo tabla',
    })
  })

  it('de tipo tabla con un valor, o una fórmula de tipo tabla que da un valor, es un problema de tipo', async () => {
    const c = crearCatalogo([consulta('T', 'select 1 from dual', 'tabla'), formula('F', '1+1', 'tabla'), constante('K', numero(1), 'tabla')])
    await c.resolverConsultas(async () => numero(1))
    expect(c.estado('T')?.problema).toEqual({ clase: 'tipo', mensaje: 'Da un número y se declaró tabla' })
    expect(c.estado('F')?.problema).toEqual({ clase: 'tipo', mensaje: 'Da un número y se declaró tabla' })
    expect(c.estado('K')?.problema).toEqual({ clase: 'tipo', mensaje: 'Una tabla sale de una consulta, de una fórmula o de datos escritos a mano: elegí otra clase' })
    expect(leerConstante('1', 'tabla')).toEqual({ ok: false, mensaje: 'Una tabla sale de una consulta a la base' })
  })

  it('pasar a tipo tabla (o dejar de serlo) la vuelve a correr', async () => {
    const c = crearCatalogo([consulta('Q', SQL)])
    await c.resolverConsultas(async () => numero(1))
    c.definir(consulta('Q', SQL, 'tabla'))
    expect(c.estado('Q')?.problema).toEqual({ clase: 'pendiente' })
  })

  it('una tabla como parámetro de otra consulta da #¡VALOR!, sin correrla', async () => {
    const c = crearCatalogo([consulta('Ventas', SQL, 'tabla'), consulta('Q', 'select 1 from dual where x = :Ventas')])
    const { ejecutor, recibidas } = ejecutorFalso({ [SQL]: () => numero(0) })
    await c.resolverConsultas(async (q) => (q.sql === SQL ? VENTAS : ejecutor(q)))
    expect(ver(c, 'Q')).toBe('#¡VALOR!')
    expect(recibidas).toHaveLength(0)
  })

  it('renombrar la tabla corrige las columnas que se usan', async () => {
    const c = crearCatalogo([consulta('Ventas', SQL, 'tabla'), formula('Total', 'SUMA(Ventas[Importe]) + FILAS(ventas)')])
    await c.resolverConsultas(async () => VENTAS)
    c.renombrar('Ventas', 'Mis ventas')
    expect(c.buscar('Total')?.origen).toEqual({ clase: 'formula', texto: 'SUMA([Mis ventas][Importe]) + FILAS([Mis ventas])' })
    expect(ver(c, 'Total')).toBe('403')
  })

  it('esVariable y esTabla', () => {
    expect(esVariable(consulta('T', SQL, 'tabla'))).toBe(true)
    expect(esTabla(VENTAS)).toBe(true)
    expect(esTabla({ columnas: ['A'], filas: [[numero(1), numero(2)]] })).toBe(false)
    expect(esTabla({ columnas: ['A'], filas: [[{ tipo: 'raro' }]] })).toBe(false)
    expect(esTabla({ columnas: [1], filas: [] })).toBe(false)
  })
})

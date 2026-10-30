import { describe, expect, it } from 'vitest'
import { ErrorConsulta, fechaASerie, numero, texto, VACIO, type Valor } from 'kalc'
import { aBind, aValor, ejecutorOracle, prepararSql, type ConexionConsultas, type PoolConsultas } from './consultas.ts'

describe('prepararSql', () => {
  it.each<[string, string]>([
    ['select last_name\nfrom employees\nwhere employee_id = 208', 'select last_name\nfrom employees\nwhere employee_id = 208'],
    ['  SELECT 1 FROM dual;  ', 'SELECT 1 FROM dual'],
    ['with t as (select 1 x from dual) select x from t', 'with t as (select 1 x from dual) select x from t'],
    // El ; adentro de un texto o de un comentario no corta la sentencia.
    ["select 'a;b' from dual -- fin;", "select 'a;b' from dual -- fin;"],
  ])('acepta %j', (sql, esperado) => {
    expect(prepararSql(sql)).toEqual({ ok: true, sql: esperado })
  })

  it.each<[string, string]>([
    ['', 'La consulta está vacía'],
    ['-- nada', 'La consulta está vacía'],
    ['delete from employees', 'Solo se aceptan consultas SELECT (o WITH)'],
    ['/* select */ update t set x = 1', 'Solo se aceptan consultas SELECT (o WITH)'],
    ['select 1 from dual; delete from t', 'Tiene que ser una sola sentencia (sin ; en el medio)'],
    ['with function f return number is begin return 1; end; select f from dual', 'La consulta no puede declarar PL/SQL ni bloquear filas (FOR UPDATE)'],
    ['select x from t for update', 'La consulta no puede declarar PL/SQL ni bloquear filas (FOR UPDATE)'],
  ])('rechaza %j', (sql, mensaje) => {
    expect(prepararSql(sql)).toEqual({ ok: false, mensaje })
  })
})

describe('conversión de valores', () => {
  const serie = fechaASerie({ anio: 2026, mes: 12, dia: 31 }) as number

  it.each<[Valor, unknown]>([
    [numero(208), 208],
    [texto('620100'), '620100'],
    [{ tipo: 'logico', valor: true }, 1],
    [VACIO, null],
    [{ tipo: 'fecha', valor: serie + 0.5 }, new Date(2026, 11, 31, 12, 0, 0)],
  ])('%j como bind', (v, esperado) => {
    expect(aBind(v)).toEqual(esperado)
  })

  it.each<[unknown, Valor]>([
    [null, VACIO],
    [1500.5, numero(1500.5)],
    ['Ernst', texto('Ernst')],
    [new Date(2026, 11, 31), { tipo: 'fecha', valor: serie }],
    [new Date(2026, 11, 31, 6, 0, 0), { tipo: 'fecha', valor: serie + 0.25 }],
  ])('%j como valor', (x, esperado) => {
    expect(aValor(x)).toEqual(esperado)
  })

  it('un tipo que no se puede usar es un error', () => {
    expect(() => aValor(Buffer.from('x'))).toThrow(ErrorConsulta)
  })
})

describe('ejecutorOracle', () => {
  /** Pool falso: anota lo que se ejecuta y responde las filas y columnas (cantidad o nombres) que se le digan. */
  function poolFalso(filas: unknown[][], columnas: number | string[] = 1) {
    const nombres = typeof columnas === 'number' ? Array.from({ length: columnas }, (_, i) => `C${i}`) : columnas
    const log: string[] = []
    const conexion = {
      callTimeout: 0,
      async execute(sql: string, binds?: unknown, opciones?: { maxRows?: number }) {
        log.push(sql === 'SET TRANSACTION READ ONLY' ? sql : `${sql} ${JSON.stringify(binds)} maxRows=${opciones?.maxRows}`)
        return { rows: filas, metaData: nombres.map((name) => ({ name })) }
      },
      rollback: async () => void log.push('rollback'),
      close: async () => void log.push('close'),
    }
    const pool: PoolConsultas = { getConnection: async () => conexion as unknown as ConexionConsultas }
    return { pool, log, conexion }
  }

  it('corre la consulta de solo lectura, con los parámetros, y la cierra', async () => {
    const { pool, log, conexion } = poolFalso([['Ernst']])
    const ejecutar = ejecutorOracle(pool, { tiempoMaximo: 1000 })
    expect(await ejecutar('select last_name from employees where employee_id = :Empleado', { Empleado: numero(208) })).toEqual(texto('Ernst'))
    expect(conexion.callTimeout).toBe(1000)
    expect(log).toEqual(['SET TRANSACTION READ ONLY', 'select last_name from employees where employee_id = :Empleado {"Empleado":208} maxRows=2', 'rollback', 'close'])
  })

  it.each<[unknown[][], number, string, string]>([
    [[], 1, '#N/D', 'La consulta no devolvió filas'],
    [[[1], [2]], 1, '#¡VALOR!', 'La consulta devolvió más de una fila'],
    [[[1, 2]], 2, '#¡VALOR!', 'La consulta devuelve más de una columna'],
  ])('%j → %s', async (filas, columnas, codigo, mensaje) => {
    const { pool, log } = poolFalso(filas, columnas)
    const error = await ejecutorOracle(pool)('select x from t', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ErrorConsulta)
    expect(error).toMatchObject({ codigo, message: mensaje })
    // Aunque falle, la conexión vuelve al pool.
    expect(log.slice(-1)).toEqual(['close'])
  })

  it('de tipo tabla trae todas las filas, hasta el máximo', async () => {
    const { pool, log } = poolFalso([['Yerba', 100], ['Café', null]], ['PRODUCTO', 'IMPORTE'])
    const r = await ejecutorOracle(pool, { filasMaximas: 10 })('select producto, importe from ventas', {}, { tabla: true })
    expect(r).toEqual({ columnas: ['PRODUCTO', 'IMPORTE'], filas: [[texto('Yerba'), numero(100)], [texto('Café'), VACIO]] })
    expect(log[1]).toBe('select producto, importe from ventas {} maxRows=11')
  })

  it.each<[unknown[][], string[], string]>([
    [[[1], [2], [3]], ['X'], 'La consulta devuelve más de 2 filas: filtrala o agrupala en el SQL'],
    [[[1, 2]], ['ID', 'id'], 'Hay dos columnas que se llaman id: ponele un alias distinto a cada una'],
  ])('de tipo tabla: %j → %s', async (filas, columnas, mensaje) => {
    const { pool } = poolFalso(filas, columnas)
    const error = await ejecutorOracle(pool, { filasMaximas: 2 })('select x from t', {}, { tabla: true }).catch((e: unknown) => e)
    expect(error).toMatchObject({ codigo: '#¡VALOR!', message: mensaje })
  })
})

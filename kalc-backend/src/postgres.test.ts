import { describe, expect, it } from 'vitest'
import pg from 'pg'
import { ErrorConsulta, numero, texto } from 'kalc'
import { aPosicionales, ejecutorPostgres, opcionesPostgres, type ClientePostgres, type PoolPostgres } from './postgres.ts'

describe('aPosicionales', () => {
  it.each<[string, string, string[]]>([
    ['select 1', 'select 1', []],
    ['select x from t where a = :Uno and b = :dos', 'select x from t where a = $1 and b = $2', ['Uno', 'dos']],
    // El mismo nombre (sin distinguir mayúsculas) es el mismo número.
    ['select :a + :B + :A', 'select $1 + $2 + $1', ['a', 'B']],
    // :: es una conversión, no un parámetro (Kalc 1.5.1).
    ['select x::int from t where d = :Desde::date', 'select x::int from t where d = $1::date', ['Desde']],
    // Adentro de textos, identificadores entre comillas y comentarios no son parámetros.
    ["select ':no', \":no\" from t -- :no\nwhere h = :Hora", "select ':no', \":no\" from t -- :no\nwhere h = $1", ['Hora']],
  ])('%j', (sql, esperado, nombres) => {
    expect(aPosicionales(sql)).toEqual({ sql: esperado, nombres })
  })
})

describe('opcionesPostgres', () => {
  const d = { nombre: 'local', tipo: 'postgres' as const, usuario: 'kalc_lectura', clave: 'z', conexion: 'localhost/kalc' }

  it('host/base, puerto 5432 por defecto, sesiones de solo lectura', () => {
    expect(opcionesPostgres(d)).toMatchObject({ host: 'localhost', port: 5432, database: 'kalc', user: 'kalc_lectura', password: 'z', options: '-c default_transaction_read_only=on' })
  })

  it('con puerto y esquemas', () => {
    expect(opcionesPostgres({ ...d, conexion: 'db:5433/otra', esquema: 'prueba,hr' })).toMatchObject({ host: 'db', port: 5433, database: 'otra', options: '-c default_transaction_read_only=on -c search_path=prueba,hr' })
  })

  it('bigint y numeric llegan como números', () => {
    const tipos = opcionesPostgres(d).types as typeof pg.types
    expect(tipos.getTypeParser(pg.types.builtins.NUMERIC, 'text')('1500.25')).toBe(1500.25)
    expect(tipos.getTypeParser(pg.types.builtins.INT8, 'text')('9007199254740991')).toBe(9007199254740991)
  })
})

describe('ejecutorPostgres', () => {
  /** Pool falso: anota lo que se ejecuta y el FETCH responde las filas y columnas que se le digan. */
  function poolFalso(filas: unknown[][], columnas: string[] = ['c0'], fallar?: Error) {
    const log: string[] = []
    const cliente: ClientePostgres = {
      async query(q) {
        const { text, values } = typeof q === 'string' ? { text: q, values: undefined } : q
        log.push(values ? `${text} ${JSON.stringify(values)}` : text)
        if (fallar && text.startsWith('DECLARE')) throw fallar
        return text.startsWith('FETCH') ? { fields: columnas.map((name) => ({ name })), rows: filas } : { rows: [] }
      },
      release: (roto) => void log.push(`release ${roto}`),
    }
    const pool: PoolPostgres = { connect: async () => cliente }
    return { pool, log }
  }

  it('corre la consulta en un cursor de solo lectura, con los parámetros, y devuelve la conexión', async () => {
    const { pool, log } = poolFalso([['Ernst']])
    const ejecutar = ejecutorPostgres(pool, { tiempoMaximo: 1000 })
    expect(await ejecutar('select last_name from employees where employee_id = :Empleado', { empleado: numero(104) })).toEqual(texto('Ernst'))
    expect(log).toEqual([
      'BEGIN READ ONLY',
      'SET LOCAL statement_timeout = 1000',
      'DECLARE kalc NO SCROLL CURSOR FOR select last_name from employees where employee_id = $1 [104]',
      'FETCH 2 FROM kalc',
      'ROLLBACK',
      'release false',
    ])
  })

  it('una tabla pide hasta filasMaximas + 1 filas', async () => {
    const { pool, log } = poolFalso(
      [
        ['IT', 5],
        ['Sales', 34],
      ],
      ['department_name', 'empleados'],
    )
    const r = await ejecutorPostgres(pool, { filasMaximas: 100 })('select ...', {}, { tabla: true })
    expect(r).toEqual({ columnas: ['department_name', 'empleados'], filas: [[texto('IT'), numero(5)], [texto('Sales'), numero(34)]] })
    expect(log).toContain('FETCH 101 FROM kalc')
  })

  it('sin filas, #N/D; con dos, #¡VALOR!', async () => {
    await expect(ejecutorPostgres(poolFalso([]).pool)('select 1', {})).rejects.toMatchObject({ codigo: '#N/D' })
    await expect(ejecutorPostgres(poolFalso([[1], [2]]).pool)('select 1', {})).rejects.toBeInstanceOf(ErrorConsulta)
  })

  it('un error de la base se propaga y la conexión vuelve al pool; uno de red, la descarta', async () => {
    const sql = new pg.DatabaseError('relation "x" does not exist', 0, 'error')
    const conError = poolFalso([], ['c0'], sql)
    await expect(ejecutorPostgres(conError.pool)('select * from x', {})).rejects.toThrow('relation "x" does not exist')
    expect(conError.log.at(-1)).toBe('release false')

    const cortada = poolFalso([], ['c0'], new Error('Connection terminated unexpectedly'))
    await expect(ejecutorPostgres(cortada.pool)('select 1', {})).rejects.toThrow('Connection terminated')
    expect(cortada.log.at(-1)).toBe('release true')
  })
})

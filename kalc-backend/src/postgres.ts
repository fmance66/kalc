import pg from 'pg'
import { ErrorConsulta, parametrosConsulta, type Valor } from 'kalc'
import { CONEXION_POSTGRES, type DatosConexion } from './conexiones.ts'
import { aBind, resultado, type EjecutarSql } from './consultas.ts'

/**
 * Las variables de consulta sobre PostgreSQL. El SQL se escribe igual que para Oracle, con
 * parámetros `:Nombre`; acá se pasan a `$1`, `$2`… Un PostgreSQL es solo para consultas: el
 * almacén de las variables es siempre Oracle.
 */

/** Lo que se usa del pool de pg: así los tests pasan uno falso. */
export interface PoolPostgres {
  connect(): Promise<ClientePostgres>
}
export interface ClientePostgres {
  query(consulta: string | { text: string; values?: unknown[]; rowMode?: 'array' }): Promise<{ fields?: { name: string }[]; rows: unknown[] }>
  release(error?: Error | boolean): void
}

// pg devuelve bigint y numeric como texto (para no perder precisión): Kalc usa números de
// JavaScript, como Excel. DATE y TIMESTAMP ya llegan como Date, en la hora local.
const NUMERICOS = new Set([pg.types.builtins.INT8, pg.types.builtins.NUMERIC])
const tipos = {
  getTypeParser: ((oid: number, formato?: 'text' | 'binary') =>
    NUMERICOS.has(oid) ? (x: string) => Number(x) : pg.types.getTypeParser(oid, formato as 'text')) as typeof pg.types.getTypeParser,
}

/**
 * Los datos del pool de pg. Las sesiones son de solo lectura (default_transaction_read_only), y con
 * esquema, ese es el search_path: las tablas se nombran sin prefijo.
 */
export function opcionesPostgres(d: DatosConexion): pg.PoolConfig {
  const [, host, puerto, base] = CONEXION_POSTGRES.exec(d.conexion) ?? []
  const opciones = ['-c default_transaction_read_only=on', ...(d.esquema ? [`-c search_path=${d.esquema}`] : [])]
  return { host, port: puerto ? Number(puerto) : 5432, database: base, user: d.usuario, password: d.clave, max: 4, options: opciones.join(' '), types: tipos }
}

/**
 * El SQL con los `:Nombre` cambiados por `$1`, `$2`… (el mismo nombre, el mismo número, sin
 * distinguir mayúsculas, como en Oracle) y los nombres en ese orden.
 */
export function aPosicionales(sql: string): { sql: string; nombres: string[] } {
  const nombres: string[] = []
  let r = ''
  let desde = 0
  for (const p of parametrosConsulta(sql)) {
    let i = nombres.findIndex((n) => n.toLowerCase() === p.nombre.toLowerCase())
    if (i < 0) i = nombres.push(p.nombre) - 1
    r += `${sql.slice(desde, p.inicio)}$${i + 1}`
    desde = p.fin
  }
  return { sql: r + sql.slice(desde), nombres }
}

function parametro(parametros: Record<string, Valor>, nombre: string): Valor {
  const clave = Object.keys(parametros).find((k) => k.toLowerCase() === nombre.toLowerCase())
  // La API ya controló que estén todos: si falta uno, es un error del servidor, no del SQL.
  if (clave === undefined) throw new Error(`Falta el parámetro ${nombre}`)
  return parametros[clave]!
}

/**
 * Como ejecutorOracle: transacción de solo lectura, tiempo máximo, y a lo sumo `filasMaximas` + 1
 * filas (2 para un valor). Las filas se piden con un cursor: así una consulta que devuelve un
 * millón no las trae todas para después decir que son demasiadas.
 */
export function ejecutorPostgres(pool: PoolPostgres, { tiempoMaximo = 15_000, filasMaximas = 10_000 } = {}): EjecutarSql {
  return async (sql, parametros, { tabla = false } = {}) => {
    const { sql: posicional, nombres } = aPosicionales(sql)
    const valores = nombres.map((n) => aBind(parametro(parametros, n)))
    const c = await pool.connect()
    let roto = false
    try {
      await c.query('BEGIN READ ONLY')
      await c.query(`SET LOCAL statement_timeout = ${Math.round(tiempoMaximo)}`)
      await c.query({ text: `DECLARE kalc NO SCROLL CURSOR FOR ${posicional}`, values: valores })
      const r = await c.query({ text: `FETCH ${tabla ? filasMaximas + 1 : 2} FROM kalc`, rowMode: 'array' })
      return resultado(r.fields?.map((f) => f.name) ?? [], r.rows as unknown[][], tabla, filasMaximas)
    } catch (e) {
      // Si se cortó la conexión, ROLLBACK también falla: el pool la descarta en vez de reusarla.
      roto = !(e instanceof pg.DatabaseError) && !(e instanceof ErrorConsulta)
      throw e
    } finally {
      await c.query('ROLLBACK').catch(() => (roto = true))
      c.release(roto)
    }
  }
}

/** Abre el pool de una conexión PostgreSQL (se conecta recién al primer pedido). */
export function abrirPostgres(d: DatosConexion): PoolPostgres & { close(segundos: number): Promise<void> } {
  const pool = new pg.Pool(opcionesPostgres(d))
  // Una conexión ociosa que se cae emite 'error': sin esto, se cae la API entera.
  pool.on('error', (e) => console.error(`PostgreSQL ${d.nombre}:`, e.message))
  return { connect: () => pool.connect(), close: () => pool.end() }
}

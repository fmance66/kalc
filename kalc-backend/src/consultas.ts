import oracledb from 'oracledb'
import { codigoSql, ErrorConsulta, fecha, fechaASerie, logico, numero, serieAFecha, texto, VACIO, type Tabla, type Valor } from 'kalc'

/**
 * Corre el SQL de una variable de consulta y devuelve su único valor o, con `tabla`, todas sus
 * filas (o lanza un ErrorConsulta). `conexion`: en qué base, si el servidor tiene varias.
 */
export type EjecutarSql = (sql: string, parametros: Record<string, Valor>, opciones?: { tabla?: boolean; conexion?: string }) => Promise<Valor | Tabla>

/** Lo que se usa del pool de oracledb: así los tests pasan uno falso. */
export interface PoolConsultas {
  getConnection(): Promise<ConexionConsultas>
}
export type ConexionConsultas = Pick<oracledb.Connection, 'execute' | 'rollback' | 'close' | 'callTimeout'>

/**
 * El SQL listo para mandar, o el motivo por el que no se acepta: una sola sentencia SELECT (o
 * WITH). No es la defensa principal (para eso, un usuario de solo lectura: ver .env.example), pero
 * frena lo obvio. El `;` final se saca: oracledb no lo acepta.
 */
export function prepararSql(sql: string): { ok: true; sql: string } | { ok: false; mensaje: string } {
  const codigo = codigoSql(sql)
  const fin = codigo.trimEnd().endsWith(';') ? codigo.lastIndexOf(';') : codigo.length
  const util = codigo.slice(0, fin).trim()
  if (!util) return { ok: false, mensaje: 'La consulta está vacía' }
  if (!/^(select|with)\b/i.test(util)) return { ok: false, mensaje: 'Solo se aceptan consultas SELECT (o WITH)' }
  // WITH FUNCTION declara PL/SQL adentro de la consulta; FOR UPDATE bloquea filas.
  if (/^with\s+(function|procedure)\b/i.test(util) || /\bfor\s+update\b/i.test(util)) {
    return { ok: false, mensaje: 'La consulta no puede declarar PL/SQL ni bloquear filas (FOR UPDATE)' }
  }
  if (util.includes(';')) return { ok: false, mensaje: 'Tiene que ser una sola sentencia (sin ; en el medio)' }
  return { ok: true, sql: sql.slice(0, fin).trim() }
}

/** Un valor de Kalc como bind de Oracle. Oracle 18 no tiene booleanos en SQL: VERDADERO es 1. */
export function aBind(v: Valor): string | number | Date | null {
  switch (v.tipo) {
    case 'numero':
      return v.valor
    case 'texto':
      return v.valor
    case 'logico':
      return v.valor ? 1 : 0
    case 'fecha': {
      const f = serieAFecha(Math.floor(v.valor))
      if (!f) throw new ErrorConsulta('#¡NUM!', 'Una fecha de los parámetros está fuera de rango')
      const segundos = Math.round((v.valor - Math.floor(v.valor)) * 86400)
      return new Date(f.anio, f.mes - 1, f.dia, 0, 0, segundos)
    }
    case 'vacio':
      return null
    case 'error':
      // El motor no manda a la base una consulta con un parámetro con error.
      throw new ErrorConsulta(v.valor, 'Un parámetro tiene un error')
  }
}

/** Lo que devuelve oracledb → un valor de Kalc. DATE trae la hora: queda como fracción del día, como en Excel. */
export function aValor(x: unknown): Valor {
  if (x === null || x === undefined) return VACIO
  if (typeof x === 'number') {
    // BINARY_DOUBLE puede traer infinito o NaN: Excel no los tiene.
    if (!Number.isFinite(x)) throw new ErrorConsulta('#¡NUM!', 'La consulta devuelve un número infinito o indefinido')
    return numero(x)
  }
  if (typeof x === 'string') return texto(x)
  if (typeof x === 'boolean') return logico(x)
  if (x instanceof Date) {
    const serie = fechaASerie({ anio: x.getFullYear(), mes: x.getMonth() + 1, dia: x.getDate() })
    if (serie === null) throw new ErrorConsulta('#¡NUM!', 'La fecha está fuera del rango de Excel (1900 a 9999)')
    return fecha(serie + (x.getHours() * 3600 + x.getMinutes() * 60 + x.getSeconds()) / 86400)
  }
  throw new ErrorConsulta('#¡VALOR!', 'La consulta devuelve un tipo de dato que no se puede usar (BLOB, RAW, objeto…)')
}

/**
 * Las filas como tabla. Las columnas se usan por nombre (`Ventas[Importe]`, sin distinguir
 * mayúsculas): dos con el mismo nombre (`select a.id, b.id`) no se podrían distinguir.
 */
function aTabla(columnas: string[], filas: unknown[][], filasMaximas: number): Tabla {
  const vistas = new Set<string>()
  for (const c of columnas) {
    if (vistas.has(c.toLowerCase())) throw new ErrorConsulta('#¡VALOR!', `Hay dos columnas que se llaman ${c}: ponele un alias distinto a cada una`)
    vistas.add(c.toLowerCase())
  }
  if (filas.length > filasMaximas) {
    throw new ErrorConsulta('#¡VALOR!', `La consulta devuelve más de ${filasMaximas.toLocaleString('es-AR')} filas: filtrala o agrupala en el SQL`)
  }
  return { columnas, filas: filas.map((f) => columnas.map((_, i) => aValor(f[i]))) }
}

/**
 * Lo que devolvió la base (a lo sumo `filasMaximas` + 1 filas, o 2 para un valor) como la tabla,
 * o como el único valor. Lo usan los ejecutores de Oracle y de PostgreSQL.
 */
export function resultado(columnas: string[], filas: unknown[][], tabla: boolean, filasMaximas: number): Valor | Tabla {
  if (tabla) return aTabla(columnas, filas, filasMaximas)
  if (columnas.length > 1) throw new ErrorConsulta('#¡VALOR!', 'La consulta devuelve más de una columna')
  if (filas.length === 0) throw new ErrorConsulta('#N/D', 'La consulta no devolvió filas')
  if (filas.length > 1) throw new ErrorConsulta('#¡VALOR!', 'La consulta devolvió más de una fila')
  return aValor(filas[0]?.[0])
}

// Los CLOB llegan como texto; si no, son un Lob que hay que leer aparte.
const fetchTypeHandler = (columna: oracledb.Metadata<unknown>) => (columna.dbType === oracledb.DB_TYPE_CLOB || columna.dbType === oracledb.DB_TYPE_NCLOB ? { type: oracledb.STRING } : undefined)

/**
 * Corre las consultas en una transacción de solo lectura, con tiempo máximo. Para un valor se piden
 * 2 filas: con eso alcanza para saber si devolvió más de una. Para una tabla, hasta `filasMaximas`
 * (una más, para saber si se pasó): todas viajan al frontend y se recorren en cada cálculo.
 */
export function ejecutorOracle(pool: PoolConsultas, { tiempoMaximo = 15_000, filasMaximas = 10_000 } = {}): EjecutarSql {
  return async (sql, parametros, { tabla = false } = {}) => {
    const binds: Record<string, string | number | Date | null> = {}
    for (const [nombre, v] of Object.entries(parametros)) binds[nombre] = aBind(v)
    const c = await pool.getConnection()
    try {
      c.callTimeout = tiempoMaximo
      await c.execute('SET TRANSACTION READ ONLY')
      const r = await c.execute<unknown[]>(sql, binds, { outFormat: oracledb.OUT_FORMAT_ARRAY, maxRows: tabla ? filasMaximas + 1 : 2, fetchTypeHandler })
      return resultado(r.metaData?.map((m) => m.name) ?? [], r.rows ?? [], tabla, filasMaximas)
    } finally {
      await c.rollback().catch(() => {})
      await c.close()
    }
  }
}

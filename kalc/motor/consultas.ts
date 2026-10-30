/**
 * Variables de consulta: su valor sale de un SELECT a la base. El motor no sabe de bases de datos:
 * encuentra los parámetros (`:Actividad`) para armar el grafo, y quien usa la librería le da un
 * `EjecutorConsultas` que corre el SQL y devuelve un solo valor, o todas las filas (una tabla).
 */

import type { Posicion } from './lexer.ts'
import type { Tabla } from './tablas.ts'
import type { CodigoError, Valor } from './valores.ts'

/** Lo que recibe el ejecutor: el SQL tal cual y el valor de cada parámetro. */
export interface Consulta {
  /** La variable de la que sale (el servidor puede buscar el SQL guardado por este nombre). */
  nombre: string
  sql: string
  /** Por nombre, como está escrito en el SQL (la primera vez que aparece), sin los dos puntos. */
  parametros: Record<string, Valor>
  /** La variable es de tipo tabla: se esperan todas las filas y columnas, no un solo valor. */
  tabla?: boolean
  /** En qué base corre, si la variable lo dice (sin esto, la de por defecto de la aplicación). */
  conexion?: string
}

/**
 * Corre la consulta y devuelve su único valor o, si `consulta.tabla`, todas sus filas. Si no se
 * puede (varias filas para un valor, error de la base), lanza un error: la variable da #¡VALOR!, o
 * el código de un `ErrorConsulta`, con el mensaje. Una tabla para una variable que espera un valor
 * sirve si tiene una sola celda.
 */
export type EjecutorConsultas = (consulta: Consulta) => Promise<Valor | Tabla>

/** Un error de la consulta con el código que tiene que dar la variable (por ejemplo, #N/D si no hay filas). */
export class ErrorConsulta extends Error {
  readonly codigo: CodigoError

  constructor(codigo: CodigoError, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorConsulta'
    this.codigo = codigo
  }
}

export interface ParametroConsulta extends Posicion {
  /** Sin los dos puntos. La posición incluye los dos puntos. */
  nombre: string
}

/** Lo que Oracle acepta como nombre de bind sin comillas. */
const NOMBRE_PARAMETRO = /^[\p{L}][\p{L}\p{N}_$#]*$/u
// `x::int` es una conversión de PostgreSQL, no el parámetro `:int`.
const PARAMETRO = /(?<!:):([\p{L}][\p{L}\p{N}_$#]*)/gu
/** q'[...]', q'{...}', q'<...>', q'(...)' o q'X...X': el texto alternativo de Oracle. */
const CIERRE_Q: Record<string, string> = { '[': ']', '{': '}', '<': '>', '(': ')' }

/** Si la variable se puede usar como parámetro en el SQL (`:nombre`): Oracle no deja espacios ni puntos. */
export function sirveComoParametro(nombre: string): boolean {
  return NOMBRE_PARAMETRO.test(nombre)
}

/**
 * Los parámetros del SQL (`:Actividad`), en orden y con su posición. Los de adentro de textos,
 * identificadores entre comillas y comentarios no cuentan (`'12:30'`), ni las conversiones de
 * PostgreSQL (`fecha::date`).
 */
export function parametrosConsulta(sql: string): ParametroConsulta[] {
  return [...codigoSql(sql).matchAll(PARAMETRO)].map((m) => ({ nombre: m[1] as string, inicio: m.index, fin: m.index + m[0].length }))
}

/**
 * El SQL con los textos ('...', q'[...]'), los identificadores entre comillas ("...") y los
 * comentarios tapados con espacios: lo que queda es código, en las mismas posiciones.
 */
export function codigoSql(sql: string): string {
  let r = ''
  let i = 0
  const tapar = (fin: number) => {
    r += sql.slice(i, fin).replace(/[^\n]/g, ' ')
    i = fin
  }
  while (i < sql.length) {
    const c = sql[i]
    const siguiente = sql[i + 1]
    const hasta = (marca: string, desde: number) => {
      const fin = sql.indexOf(marca, desde)
      return fin < 0 ? sql.length : fin + marca.length
    }
    if (c === '-' && siguiente === '-') tapar(hasta('\n', i))
    else if (c === '/' && siguiente === '*') tapar(hasta('*/', i + 2))
    else if ((c === 'q' || c === 'Q') && siguiente === "'" && !/[\p{L}\p{N}_$#]/u.test(sql[i - 1] ?? '')) {
      const apertura = sql[i + 2] ?? ''
      tapar(hasta((CIERRE_Q[apertura] ?? apertura) + "'", i + 3))
    }
    // '' adentro de un texto es una comilla: se tapa igual, como dos textos seguidos.
    else if (c === "'" || c === '"') tapar(hasta(c, i + 1))
    else r += sql[i++]
  }
  return r
}

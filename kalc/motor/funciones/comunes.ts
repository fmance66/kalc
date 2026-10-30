/** Lo que comparten las funciones: cómo convierte Excel cada argumento y cómo redondea. */

import type { Argumento } from './registro.ts'
import { celdasDe, type Rango } from '../tablas.ts'
import { aNumero, aTexto, error, esError, numero, redondear15, type Valor, type ValorError } from '../valores.ts'

/** El argumento como número (`"3"` → 3, VERDADERO → 1, vacío → 0). */
export function argNumero(a: Argumento | undefined): number | ValorError {
  return a ? aNumero(a()) : 0
}

/** Como `argNumero`, sin decimales: Excel trunca las cantidades (`IZQUIERDA("abc";1,9)` toma 1). */
export function argEntero(a: Argumento | undefined): number | ValorError {
  const n = argNumero(a)
  return typeof n === 'number' ? Math.trunc(n) : n
}

export function argTexto(a: Argumento | undefined): string | ValorError {
  return a ? aTexto(a()) : ''
}

/**
 * A lógico, para las condiciones: un número es VERDADERO si no es 0; vacío es FALSO; el texto
 * "VERDADERO"/"FALSO" (o en inglés) se acepta, cualquier otro texto da #¡VALOR!.
 */
export function aLogico(v: Valor): boolean | ValorError {
  switch (v.tipo) {
    case 'logico':
      return v.valor
    case 'numero':
    case 'fecha':
      return v.valor !== 0
    case 'vacio':
      return false
    case 'error':
      return v
    case 'texto': {
      const t = v.valor.trim().toUpperCase()
      if (t === 'VERDADERO' || t === 'TRUE') return true
      if (t === 'FALSO' || t === 'FALSE') return false
      return error('#¡VALOR!')
    }
  }
}

/**
 * El valor que devuelven `SI`, `SI.ERROR`, etc.: un argumento omitido (`SI(VERDADERO;)`) da 0,
 * como en Excel; una variable vacía sigue vacía (se comporta como la celda).
 */
export function resultado(a: Argumento | undefined): Valor {
  if (!a) return numero(0)
  const v = a()
  return v.tipo === 'vacio' && !a.referencia ? numero(0) : v
}

/**
 * El rango del argumento, para las funciones que solo aceptan rangos (`CONTAR.SI`, `BUSCARV`). Un
 * valor suelto cuenta como un rango de una celda (Excel no deja escribir eso, pero acepta una celda).
 */
export function rangoDe(a: Argumento | undefined): Rango | ValorError {
  if (!a) return error('#¡VALOR!')
  if (a.rango) return a.rango()
  const v = a()
  return esError(v) ? v : [[v]]
}

/**
 * Los valores del argumento uno por uno: las celdas de una tabla o columna, o el valor solo.
 * `celdas` dice si salen de una variable o un rango (Excel los trata como celdas: ignora el texto).
 */
export function valoresDe(a: Argumento): { valores: Valor[]; celdas: boolean } | ValorError {
  if (a.rango) {
    const r = a.rango()
    return 'tipo' in r ? r : { valores: celdasDe(r), celdas: true }
  }
  return { valores: [a()], celdas: a.referencia === true }
}

/**
 * Los números de `SUMA`, `PROMEDIO`, `MIN` y `MAX`. Como en Excel: un valor escrito directo se
 * convierte (`SUMA("3";VERDADERO)` = 4, `SUMA("abc")` = #¡VALOR!), pero de una variable, una tabla
 * o una columna solo cuentan los números y las fechas (el texto, los lógicos y el vacío se ignoran,
 * como en una celda). Los errores siempre se propagan. `fechas` dice si todos los que contaron eran
 * fechas.
 */
export function numerosDe(args: readonly Argumento[]): { numeros: number[]; fechas: boolean } | ValorError {
  const numeros: number[] = []
  let fechas = true
  for (const a of args) {
    const r = valoresDe(a)
    if ('tipo' in r) return r
    for (const v of r.valores) {
      const x = numeroDe(v, r.celdas)
      if (x === null) continue
      if (typeof x !== 'number') return x
      numeros.push(x)
      if (v.tipo !== 'fecha') fechas = false
    }
  }
  return { numeros, fechas: fechas && numeros.length > 0 }
}

/** El número de un valor para `numerosDe`: `null` si se ignora (texto de una celda). */
function numeroDe(v: Valor, celda: boolean): number | ValorError | null {
  if (esError(v)) return v
  if (celda && v.tipo !== 'numero' && v.tipo !== 'fecha') return null
  return aNumero(v)
}

/** `x^y` con los errores de Excel. */
export function potencia(x: number, y: number): Valor {
  // 0^0 no está definido; 0 elevado a un negativo es dividir por cero.
  if (x === 0 && y === 0) return error('#¡NUM!')
  if (x === 0 && y < 0) return error('#¡DIV/0!')
  const r = x ** y
  // Desborde o raíz de un negativo ((-8)^(1/3)).
  return Number.isFinite(r) ? numero(r) : error('#¡NUM!')
}

/** Cómo resolver el último dígito: `mitad` (REDONDEAR), `afuera` (.MAS), `adentro` (.MENOS, TRUNCAR). */
export type ModoRedondeo = 'mitad' | 'afuera' | 'adentro'

/**
 * Redondea a `digitos` decimales (negativos: decenas, centenas) como Excel: la mitad se aleja del
 * cero (`REDONDEAR(-2,5;0)` = -3, no el redondeo de `Math.round`), y se trabaja sobre los 15
 * dígitos que muestra Excel, así `REDONDEAR(2,675;2)` da 2,68 aunque el double sea 2,67499…
 */
export function redondearA(n: number, digitos: number, modo: ModoRedondeo): number {
  const d = Math.trunc(digitos)
  const x = Math.abs(correr(n, d))
  if (!Number.isFinite(x)) return n // más decimales de los que tiene el double: queda igual
  const r = modo === 'mitad' ? Math.floor(x + 0.5) : modo === 'afuera' ? Math.ceil(x) : Math.floor(x)
  return Math.sign(n) * correr(r, -d) || 0 // sin -0
}

/** `n × 10^d` corriendo la coma en el texto del número: multiplicar agregaría errores binarios. */
function correr(n: number, d: number): number {
  const [mantisa = '0', exponente = '0'] = redondear15(n).toExponential().split('e')
  return Number(`${mantisa}e${Number(exponente) + d}`)
}


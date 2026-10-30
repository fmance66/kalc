/**
 * Texto → tokens, con la sintaxis de Excel en castellano (Argentina): `;` separa argumentos y
 * `,` es el separador decimal.
 */

import { ERRORES, type CodigoError } from './valores.ts'

/** Posición en el texto de la fórmula (inicio incluido, fin excluido), para subrayar en la UI. */
export interface Posicion {
  inicio: number
  fin: number
}

export type Operador = '+' | '-' | '*' | '/' | '^' | '&' | '%' | '=' | '<>' | '<' | '>' | '<=' | '>='

export type Token = Posicion &
  (
    | { clase: 'numero'; valor: number }
    | { clase: 'texto'; valor: string }
    | { clase: 'error'; valor: CodigoError }
    /**
     * Nombre de función, de variable, o VERDADERO/FALSO (lo decide el parser). Con `columna`, una
     * columna de una tabla: `Ventas[Importe]` (el corchete pegado al nombre). Con `filaActual`, la
     * celda de la fila que se calcula: `[@Importe]` (sin nombre) o `Ventas[@Importe]`.
     */
    | { clase: 'nombre'; valor: string; entreCorchetes: boolean; columna?: string; filaActual?: boolean }
    | { clase: 'operador'; valor: Operador }
    | { clase: '(' | ')' | ';' | 'fin' }
  )

export class ErrorSintaxis extends Error {
  readonly posicion: Posicion

  /** `posicion` puede ser un token o un nodo: se guarda solo inicio y fin. */
  constructor(mensaje: string, { inicio, fin }: Posicion) {
    super(mensaje)
    this.name = 'ErrorSintaxis'
    this.posicion = { inicio, fin }
  }
}

const OPERADORES_DOBLES = ['<>', '<=', '>='] as const
const OPERADORES_SIMPLES = '+-*/^&%=<>'
/** Los códigos de error más largos primero: `#N/D` no debe cortar a uno que empiece igual. */
const CODIGOS_ERROR = Object.keys(ERRORES).sort((a, b) => b.length - a.length)

const NUMERO = /\d*(?:,\d+)?(?:[eE][+-]?\d+)?/y
const INICIO_NOMBRE = /[\p{L}_]/u
const NOMBRE = /[\p{L}_][\p{L}\p{N}_.]*/uy

/** Después de estos tokens viene un operador, un `;` o un `)`, nunca otro valor. */
function terminaUnValor(t: Token | undefined): boolean {
  if (!t) return false
  return t.clase === 'numero' || t.clase === 'texto' || t.clase === 'error' || t.clase === 'nombre' || t.clase === ')' || (t.clase === 'operador' && t.valor === '%')
}

/**
 * El texto entre `[` (en `desde`) y `]`, sin espacios en los bordes, y dónde termina. `[@[Monto total]]`
 * (como lo escribe Excel cuando la columna tiene espacios) es lo mismo que `[@Monto total]`.
 */
function entreCorchetes(formula: string, desde: number, sinCierre: string, vacio: string): { valor: string; fin: number } {
  if (formula.startsWith('[@[', desde)) {
    const cierreDoble = formula.indexOf(']]', desde)
    if (cierreDoble < 0) throw new ErrorSintaxis(sinCierre, { inicio: desde, fin: formula.length })
    const columna = formula.slice(desde + 3, cierreDoble).trim()
    if (!columna) throw new ErrorSintaxis(vacio, { inicio: desde, fin: cierreDoble + 2 })
    return { valor: `@${columna}`, fin: cierreDoble + 2 }
  }
  const cierre = formula.indexOf(']', desde)
  if (cierre < 0) throw new ErrorSintaxis(sinCierre, { inicio: desde, fin: formula.length })
  const valor = formula.slice(desde + 1, cierre).trim()
  if (!valor) throw new ErrorSintaxis(vacio, { inicio: desde, fin: cierre + 1 })
  return { valor, fin: cierre + 1 }
}

export function tokenizar(formula: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < formula.length) {
    const c = formula[i] ?? ''
    if (/\s/.test(c)) {
      i++
      continue
    }
    const inicio = i

    // Números: 12, 1,5, ,5, 1E3, 1,5E-3. Una coma después de un valor no puede empezar un número:
    // es el error típico de separar argumentos con coma (sintaxis en inglés), `SI(A,1,2)`.
    if (/\d/.test(c) || (c === ',' && /\d/.test(formula[i + 1] ?? '') && !terminaUnValor(tokens.at(-1)))) {
      NUMERO.lastIndex = i
      const m = NUMERO.exec(formula)?.[0] ?? ''
      i += m.length
      tokens.push({ clase: 'numero', valor: Number(m.replace(',', '.').replace(/^\./, '0.')), inicio, fin: i })
      continue
    }

    if (c === '"') {
      // Las comillas dentro de un texto se escriben duplicadas: "dijo ""hola"""
      let valor = ''
      i++
      for (;;) {
        if (i >= formula.length) throw new ErrorSintaxis('Falta cerrar las comillas del texto', { inicio, fin: i })
        if (formula[i] === '"') {
          if (formula[i + 1] !== '"') break
          i++
        }
        valor += formula[i]
        i++
      }
      i++
      tokens.push({ clase: 'texto', valor, inicio, fin: i })
      continue
    }

    if (c === '[' || INICIO_NOMBRE.test(c)) {
      let valor: string
      if (c === '[') {
        const corchete = entreCorchetes(formula, i, 'Falta cerrar el corchete del nombre', 'Nombre vacío entre corchetes')
        valor = corchete.valor
        i = corchete.fin
      } else {
        NOMBRE.lastIndex = i
        valor = NOMBRE.exec(formula)?.[0] ?? c
        i += valor.length
      }
      const token: Token = { clase: 'nombre', valor, entreCorchetes: c === '[', inicio, fin: i }
      // [@Alta]: la celda de la fila que se calcula, en una columna calculada (no es un nombre).
      if (c === '[' && valor.startsWith('@')) {
        const columna = valor.slice(1).trim()
        if (!columna) throw new ErrorSintaxis('Falta el nombre de la columna', { inicio, fin: i })
        Object.assign(token, { valor: '', columna, filaActual: true })
      }
      // Un corchete pegado al nombre es una columna de una tabla, como en Excel: Ventas[Importe].
      else if (formula[i] === '[') {
        const columna = entreCorchetes(formula, i, 'Falta cerrar el corchete de la columna', 'Falta el nombre de la columna')
        token.columna = columna.valor
        i = token.fin = columna.fin
        if (token.columna.startsWith('@')) {
          token.columna = token.columna.slice(1).trim()
          token.filaActual = true
          if (!token.columna) throw new ErrorSintaxis('Falta el nombre de la columna', token)
        }
      }
      tokens.push(token)
      continue
    }

    if (c === '#') {
      const resto = formula.slice(i).toUpperCase()
      const codigo = CODIGOS_ERROR.find((e) => resto.startsWith(e))
      if (!codigo) throw new ErrorSintaxis('Error desconocido (por ejemplo: #N/D, #¡VALOR!)', { inicio, fin: i + 1 })
      i += codigo.length
      tokens.push({ clase: 'error', valor: ERRORES[codigo] as CodigoError, inicio, fin: i })
      continue
    }

    const doble = OPERADORES_DOBLES.find((o) => formula.startsWith(o, i))
    if (doble) {
      i += 2
      tokens.push({ clase: 'operador', valor: doble, inicio, fin: i })
      continue
    }
    if (OPERADORES_SIMPLES.includes(c)) {
      i++
      tokens.push({ clase: 'operador', valor: c as Operador, inicio, fin: i })
      continue
    }

    if (c === '(' || c === ')' || c === ';') {
      i++
      tokens.push({ clase: c, inicio, fin: i })
      continue
    }

    const pista =
      c === ','
        ? 'Los argumentos se separan con punto y coma (;); la coma es el separador decimal'
        : c === '.'
          ? 'El separador decimal es la coma (1,5), no el punto'
          : `Carácter inesperado: ${c}`
    throw new ErrorSintaxis(pista, { inicio, fin: i + 1 })
  }
  tokens.push({ clase: 'fin', inicio: formula.length, fin: formula.length })
  return tokens
}

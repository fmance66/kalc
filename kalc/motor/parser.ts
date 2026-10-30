/**
 * Tokens → árbol, por precedencia de operadores (Pratt), con las precedencias de Excel.
 */

import type { Nodo, OperadorBinario } from './ast.ts'
import { ErrorSintaxis, tokenizar, type Posicion, type Token } from './lexer.ts'

export type ResultadoParseo = { ok: true; arbol: Nodo } | { ok: false; error: { mensaje: string } & Posicion }

/**
 * Fuerza de cada operador binario (más alta = se aplica antes). Todos asocian a izquierda, `^`
 * también: en Excel `2^3^2 = (2^3)^2 = 64`.
 */
const PRECEDENCIA: Record<OperadorBinario, number> = {
  '=': 1,
  '<>': 1,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '^': 5,
}
const PRECEDENCIA_PORCENTAJE = 6
/** El menos unario va antes que `^`: en Excel `-2^2 = (-2)^2 = 4`, no -4 como en matemática. */
const PRECEDENCIA_UNARIO = 7

const LOGICOS: Readonly<Record<string, boolean>> = { VERDADERO: true, FALSO: false, TRUE: true, FALSE: false }

export function parsear(formula: string): ResultadoParseo {
  try {
    return { ok: true, arbol: new Parser(formula).formula() }
  } catch (e) {
    if (e instanceof ErrorSintaxis) return { ok: false, error: { mensaje: e.message, ...e.posicion } }
    throw e
  }
}

class Parser {
  private readonly tokens: Token[]
  private i = 0

  constructor(formula: string) {
    this.tokens = tokenizar(formula)
  }

  formula(): Nodo {
    // El = inicial es opcional.
    const primero = this.actual()
    if (primero.clase === 'operador' && primero.valor === '=') this.i++
    if (this.actual().clase === 'fin') throw new ErrorSintaxis('La fórmula está vacía', this.actual())
    const arbol = this.expresion(0)
    const resto = this.actual()
    if (resto.clase !== 'fin') {
      throw new ErrorSintaxis(resto.clase === ')' ? 'Sobra un paréntesis de cierre' : 'Falta un operador antes de esto', resto)
    }
    return arbol
  }

  private actual(): Token {
    // Siempre hay un token 'fin' al final.
    return this.tokens[this.i] ?? (this.tokens.at(-1) as Token)
  }

  private avanzar(): Token {
    const t = this.actual()
    if (t.clase !== 'fin') this.i++
    return t
  }

  private expresion(minima: number): Nodo {
    let izquierda = this.prefijo()
    for (;;) {
      const t = this.actual()
      if (t.clase !== 'operador') break
      if (t.valor === '%') {
        if (PRECEDENCIA_PORCENTAJE < minima) break
        this.avanzar()
        izquierda = { clase: 'porcentaje', operando: izquierda, inicio: izquierda.inicio, fin: t.fin }
        continue
      }
      const p = PRECEDENCIA[t.valor]
      if (p < minima) break
      this.avanzar()
      // Asociativo a izquierda: el lado derecho solo toma operadores más fuertes.
      const derecha = this.expresion(p + 1)
      izquierda = { clase: 'binario', operador: t.valor, izquierda, derecha, inicio: izquierda.inicio, fin: derecha.fin }
    }
    return izquierda
  }

  private prefijo(): Nodo {
    const t = this.avanzar()
    switch (t.clase) {
      case 'numero':
      case 'texto':
      case 'error':
        return { clase: t.clase, valor: t.valor, inicio: t.inicio, fin: t.fin } as Nodo
      case 'operador':
        if (t.valor === '-' || t.valor === '+') {
          const operando = this.expresion(PRECEDENCIA_UNARIO)
          return { clase: 'unario', operador: t.valor, operando, inicio: t.inicio, fin: operando.fin }
        }
        throw new ErrorSintaxis(`Falta un valor antes de ${t.valor}`, t)
      case '(': {
        const interior = this.expresion(0)
        this.esperarCierre(t)
        // La posición incluye los paréntesis, para subrayar el grupo entero.
        return { ...interior, inicio: t.inicio, fin: this.tokens[this.i - 1]?.fin ?? interior.fin }
      }
      case 'nombre':
        return this.nombre(t)
      case 'fin':
        throw new ErrorSintaxis('La fórmula termina antes de tiempo: falta un valor', t)
      case ')':
        throw new ErrorSintaxis('Falta un valor antes del paréntesis', t)
      case ';':
        throw new ErrorSintaxis('Punto y coma fuera de una función', t)
    }
  }

  private nombre(t: Extract<Token, { clase: 'nombre' }>): Nodo {
    if (t.columna !== undefined) {
      return { clase: 'referencia', nombre: t.valor, columna: t.columna, ...(t.filaActual ? { filaActual: true as const } : {}), inicio: t.inicio, fin: t.fin }
    }
    if (!t.entreCorchetes && this.actual().clase === '(') return this.llamada(t)
    const logico = t.entreCorchetes ? undefined : LOGICOS[t.valor.toUpperCase()]
    if (logico !== undefined) return { clase: 'logico', valor: logico, inicio: t.inicio, fin: t.fin }
    return { clase: 'referencia', nombre: t.valor, inicio: t.inicio, fin: t.fin }
  }

  private llamada(t: Extract<Token, { clase: 'nombre' }>): Nodo {
    const apertura = this.avanzar()
    const argumentos: Nodo[] = []
    if (this.actual().clase === ')') {
      this.avanzar()
    } else {
      for (;;) {
        const a = this.actual()
        // Argumento omitido: SI(A;;2), o un ; al final: SI(A;1;)
        if (a.clase === ';' || a.clase === ')') argumentos.push({ clase: 'omitido', inicio: a.inicio, fin: a.inicio })
        else argumentos.push(this.expresion(0))
        if (this.actual().clase === ';') {
          this.avanzar()
          continue
        }
        this.esperarCierre(apertura, t.valor)
        break
      }
    }
    return { clase: 'llamada', nombre: t.valor.toUpperCase(), argumentos, inicio: t.inicio, fin: this.tokens[this.i - 1]?.fin ?? t.fin }
  }

  private esperarCierre(apertura: Posicion, funcion?: string) {
    const t = this.actual()
    if (t.clase === ')') {
      this.avanzar()
      return
    }
    if (t.clase === 'fin') throw new ErrorSintaxis(funcion ? `Falta cerrar el paréntesis de ${funcion}` : 'Falta cerrar el paréntesis', apertura)
    throw new ErrorSintaxis(funcion ? 'Falta un ; entre los argumentos' : 'Falta un operador antes de esto', t)
  }
}

/** Lógicas: SI, Y, O, NO, SI.ERROR, SI.CONJUNTO, CAMBIAR, VERDADERO, FALSO. */

import { aLogico, resultado, valoresDe } from './comunes.ts'
import type { Argumento, DefinicionFuncion } from './registro.ts'
import { comparar, error, esError, logico, type Valor } from '../valores.ts'

/**
 * Y / O. No hacen cortocircuito: Excel evalúa todos los argumentos (`Y(FALSO;1/0)` da
 * #¡DIV/0!). De una variable, una tabla o una columna se ignoran el texto y el vacío; si no queda
 * ningún lógico, #¡VALOR!.
 */
function combinar(args: readonly Argumento[], inicial: boolean): Valor {
  let hay = false
  let r = inicial
  for (const a of args) {
    const valores = valoresDe(a)
    if ('tipo' in valores) return valores
    for (const v of valores.valores) {
      if (esError(v)) return v
      if (valores.celdas && (v.tipo === 'texto' || v.tipo === 'vacio')) continue
      const b = aLogico(v)
      if (typeof b !== 'boolean') return b
      hay = true
      // Y: todos verdaderos (arranca en VERDADERO); O: alguno (arranca en FALSO).
      if (b !== inicial) r = b
    }
  }
  return hay ? logico(r) : error('#¡VALOR!')
}

export const LOGICAS: DefinicionFuncion[] = [
  {
    nombre: 'SI',
    alias: ['IF'],
    minimo: 2,
    maximo: 3,
    categoria: 'Lógicas',
    firma: 'SI(condición; [si_verdadero]; [si_falso])',
    descripcion: 'Si la condición se cumple devuelve el segundo argumento; si no, el tercero (o FALSO si falta). Solo evalúa el que corresponde.',
    ejemplo: 'SI(1>2; "mayor"; "menor o igual")',
    evaluar: ([condicion, siVerdadero, siFalso]) => {
      const c = aLogico(condicion?.() ?? logico(false))
      if (typeof c !== 'boolean') return c
      if (c) return resultado(siVerdadero)
      // Con dos argumentos y la condición falsa, Excel devuelve FALSO.
      return siFalso ? resultado(siFalso) : logico(false)
    },
  },
  {
    nombre: 'Y',
    alias: ['AND'],
    minimo: 1,
    maximo: 255,
    categoria: 'Lógicas',
    firma: 'Y(lógico1; [lógico2]; …)',
    descripcion: 'VERDADERO si todos los argumentos son verdaderos. Evalúa todos (no hace cortocircuito).',
    ejemplo: 'Y(2>1; "a"="A")',
    evaluar: (args) => combinar(args, true),
  },
  {
    nombre: 'O',
    alias: ['OR'],
    minimo: 1,
    maximo: 255,
    categoria: 'Lógicas',
    firma: 'O(lógico1; [lógico2]; …)',
    descripcion: 'VERDADERO si alguno de los argumentos es verdadero. Evalúa todos (no hace cortocircuito).',
    ejemplo: 'O(1>2; 0; VERDADERO)',
    evaluar: (args) => combinar(args, false),
  },
  {
    nombre: 'NO',
    alias: ['NOT'],
    minimo: 1,
    maximo: 1,
    categoria: 'Lógicas',
    firma: 'NO(lógico)',
    descripcion: 'Invierte el valor lógico: un número distinto de 0 cuenta como VERDADERO.',
    ejemplo: 'NO(0)',
    evaluar: ([a]) => {
      const b = aLogico(a?.() ?? logico(false))
      return typeof b === 'boolean' ? logico(!b) : b
    },
  },
  {
    nombre: 'SI.ERROR',
    alias: ['IFERROR'],
    minimo: 2,
    maximo: 2,
    categoria: 'Lógicas',
    firma: 'SI.ERROR(valor; si_error)',
    descripcion: 'El valor, o el segundo argumento si el valor es un error (cualquiera). El segundo solo se evalúa si hace falta.',
    ejemplo: 'SI.ERROR(1/0; "sin dato")',
    evaluar: ([valor, siError]) => {
      const v = resultado(valor)
      return esError(v) ? resultado(siError) : v
    },
  },
  {
    nombre: 'SI.CONJUNTO',
    alias: ['IFS'],
    minimo: 2,
    maximo: 254,
    categoria: 'Lógicas',
    firma: 'SI.CONJUNTO(condición1; valor1; [condición2; valor2]; …)',
    descripcion: 'El valor de la primera condición que se cumple; #N/D si no se cumple ninguna. Para un "si no", poner VERDADERO como última condición.',
    ejemplo: 'SI.CONJUNTO(5<3; "chico"; 5<10; "mediano"; VERDADERO; "grande")',
    evaluar: (args) => {
      // Excel no deja escribirla con una condición sin su valor.
      if (args.length % 2 !== 0) return error('#¡VALOR!')
      for (let i = 0; i < args.length; i += 2) {
        const c = aLogico(args[i]?.() ?? logico(false))
        if (typeof c !== 'boolean') return c
        if (c) return resultado(args[i + 1])
      }
      return error('#N/D')
    },
  },
  {
    nombre: 'CAMBIAR',
    alias: ['SWITCH'],
    minimo: 3,
    maximo: 254,
    categoria: 'Lógicas',
    firma: 'CAMBIAR(expresión; valor1; resultado1; [valor2; resultado2]; …; [si_no])',
    descripcion: 'Compara la expresión con cada valor y devuelve el resultado del primero igual; si ninguno coincide, el último argumento sobrante o #N/D.',
    ejemplo: 'CAMBIAR(2; 1; "uno"; 2; "dos"; "otro")',
    evaluar: ([expresion, ...resto]) => {
      const e = expresion?.() ?? error('#N/D')
      if (esError(e)) return e
      // Con una cantidad impar de argumentos después de la expresión, el último es el "si no".
      const pares = resto.length - (resto.length % 2)
      for (let i = 0; i < pares; i += 2) {
        const v = resto[i]?.() ?? error('#N/D')
        if (esError(v)) return v
        // Igual que el operador =: sin distinguir mayúsculas y sin convertir entre tipos.
        if (comparar(e, v) === 0) return resultado(resto[i + 1])
      }
      return pares < resto.length ? resultado(resto[pares]) : error('#N/D')
    },
  },
  {
    nombre: 'VERDADERO',
    alias: ['TRUE'],
    minimo: 0,
    maximo: 0,
    categoria: 'Lógicas',
    firma: 'VERDADERO()',
    descripcion: 'El valor lógico VERDADERO (también se puede escribir sin paréntesis).',
    ejemplo: 'VERDADERO()',
    evaluar: () => logico(true),
  },
  {
    nombre: 'FALSO',
    alias: ['FALSE'],
    minimo: 0,
    maximo: 0,
    categoria: 'Lógicas',
    firma: 'FALSO()',
    descripcion: 'El valor lógico FALSO (también se puede escribir sin paréntesis).',
    ejemplo: 'FALSO()',
    evaluar: () => logico(false),
  },
]


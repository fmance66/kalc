/** Nodos del árbol de una fórmula. Cada uno guarda su posición en el texto. */

import type { Operador, Posicion } from './lexer.ts'
import type { CodigoError } from './valores.ts'

export type OperadorBinario = Exclude<Operador, '%'>

export type Nodo = Posicion &
  (
    | { clase: 'numero'; valor: number }
    | { clase: 'texto'; valor: string }
    | { clase: 'logico'; valor: boolean }
    | { clase: 'error'; valor: CodigoError }
    /**
     * Una variable por su nombre (tal como se escribió). Con `columna`, una columna de una variable
     * de tipo tabla: `Ventas[Importe]` (la posición abarca las dos partes). Con `filaActual`, la
     * celda de esa columna en la fila que se calcula (`[@Importe]`, con `nombre` vacío, o
     * `Ventas[@Importe]`): solo tiene sentido en una columna calculada.
     */
    | { clase: 'referencia'; nombre: string; columna?: string; filaActual?: true }
    | { clase: 'unario'; operador: '-' | '+'; operando: Nodo }
    | { clase: 'porcentaje'; operando: Nodo }
    | { clase: 'binario'; operador: OperadorBinario; izquierda: Nodo; derecha: Nodo }
    /** `nombre` en mayúsculas. */
    | { clase: 'llamada'; nombre: string; argumentos: Nodo[] }
    /** Argumento omitido: `SI(A;;2)`. */
    | { clase: 'omitido' }
  )

/** Los hijos de un nodo, en orden de evaluación. */
export function hijos(n: Nodo): Nodo[] {
  switch (n.clase) {
    case 'unario':
    case 'porcentaje':
      return [n.operando]
    case 'binario':
      return [n.izquierda, n.derecha]
    case 'llamada':
      return n.argumentos
    default:
      return []
  }
}

/**
 * Las variables que nombra la fórmula, sin repetir (sin distinguir mayúsculas), en orden de aparición.
 * `[@Columna]` no cuenta: es una celda de la misma tabla, no otra variable.
 */
export function dependencias(raiz: Nodo): string[] {
  const vistas = new Map<string, string>()
  const recorrer = (n: Nodo) => {
    if (n.clase === 'referencia' && !n.filaActual && !vistas.has(n.nombre.toLowerCase())) vistas.set(n.nombre.toLowerCase(), n.nombre)
    hijos(n).forEach(recorrer)
  }
  recorrer(raiz)
  return [...vistas.values()]
}

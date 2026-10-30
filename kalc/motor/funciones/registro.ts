/**
 * Registro de funciones. Cada función recibe sus argumentos **sin evaluar** (thunks) y decide
 * cuáles evaluar: así `SI`, `SI.ERROR`, `SI.CONJUNTO` y `CAMBIAR` hacen cortocircuito como en
 * Excel. (`Y` y `O` no: en Excel evalúan todo, y `Y(FALSO;1/0)` da #¡DIV/0!).
 */

import type { Rango } from '../tablas.ts'
import type { Valor, ValorError } from '../valores.ts'
import { BUSQUEDA } from './busqueda.ts'
import { ESTADISTICAS } from './estadisticas.ts'
import { MATRICES } from './matrices.ts'
import { FECHAS } from './fechas.ts'
import { INFORMACION } from './informacion.ts'
import { LOGICAS } from './logicas.ts'
import { MATEMATICAS } from './matematicas.ts'
import { TEXTO } from './texto.ts'

/**
 * Un argumento sin evaluar. `referencia` dice si es una variable sola (`SUMA(A)`): Excel la trata
 * como una celda y en `SUMA`, `Y`, etc. ignora el texto y los lógicos que tenga.
 */
export interface Argumento {
  (): Valor
  readonly referencia?: boolean
  /**
   * Si el argumento es una tabla o una de sus columnas (`Ventas`, `Ventas[Importe]`): sus celdas,
   * fila por fila, o el error si no se puede leer (la consulta pendiente da #N/D). Sin esto, el
   * argumento evaluado es un solo valor (#¡VALOR! si el rango tiene más de una celda).
   */
  readonly rango?: () => Rango | ValorError
}

export type Categoria = 'Lógicas' | 'Matemáticas' | 'Estadísticas' | 'Búsqueda' | 'Matrices' | 'Texto' | 'Información' | 'Fechas'

export interface DefinicionFuncion {
  /** Nombre en castellano, en mayúsculas: `SI`, `SI.ERROR`. */
  nombre: string
  /** Otros nombres que también se aceptan: el de Excel en inglés (`IF`) o uno anterior. */
  alias?: readonly string[]
  minimo: number
  /** `Infinity` para las de cantidad variable (`SUMA`). */
  maximo: number
  evaluar: (args: readonly Argumento[]) => Valor
  /**
   * Para las que devuelven una tabla (FILTRAR, ORDENAR): el rango. Con esto, la fórmula puede dar
   * una tabla y la función sirve como argumento de otras (`FILAS(FILTRAR(…))`); como valor suelto
   * se usa `evaluar`.
   */
  evaluarRango?: (args: readonly Argumento[]) => Rango | ValorError
  /**
   * Para las de un valor (`MAYUSC`, `ESNUMERO`, `AÑO`): con un rango donde espera un valor, se
   * aplica celda por celda y da un rango, como en Excel 365. `ESNUMERO(HALLAR("x"; Ventas[Cliente]))`
   * da una columna de VERDADERO y FALSO, que sirve como condición de FILTRAR. Las que leen un rango
   * entero (`SUMA`, `CONTAR.SI`) no lo llevan.
   */
  porCelda?: boolean
  /** Para el catálogo. Las funciones propias sin categoría se listan aparte. */
  categoria?: Categoria
  /** `SI(condición; [si_verdadero]; [si_falso])`: los opcionales entre corchetes. */
  firma?: string
  descripcion?: string
  /** Una fórmula de ejemplo, que el catálogo evalúa en vivo. */
  ejemplo?: string
  /** Da otro resultado cada vez aunque no cambien sus argumentos (`HOY`): se recalcula siempre. */
  volatil?: boolean
  /**
   * Propia de Kalc: no existe en Excel (`CONTIENE`). El catálogo la marca, para que nadie la busque
   * en una planilla; su descripción dice cómo se escribe lo mismo en Excel.
   */
  propia?: boolean
}

const registro = new Map<string, DefinicionFuncion>()

/** Agrega (o reemplaza) una función: también sirve para las funciones propias del negocio. */
export function registrarFuncion(def: DefinicionFuncion): void {
  for (const nombre of [def.nombre, ...(def.alias ?? [])]) registro.set(nombre.toUpperCase(), def)
}

export function buscarFuncion(nombre: string): DefinicionFuncion | undefined {
  return registro.get(nombre.toUpperCase())
}

/** Las funciones registradas, una vez cada una (sin los alias). */
export function listarFunciones(): DefinicionFuncion[] {
  return [...new Set(registro.values())]
}

for (const def of [...LOGICAS, ...MATEMATICAS, ...ESTADISTICAS, ...BUSQUEDA, ...MATRICES, ...TEXTO, ...INFORMACION, ...FECHAS]) registrarFuncion(def)

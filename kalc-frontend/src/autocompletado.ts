import { nombreEnFormula, type Tabla } from 'kalc'

/** Una variable que se puede ofrecer al escribir `[` o con Ctrl+Espacio. */
export interface Candidata {
  nombre: string
  /** Lo que se muestra a la derecha: el tipo, el valor, el tamaño de la tabla. */
  detalle?: string | undefined
}

export interface Opcion {
  etiqueta: string
  /** Lo que reemplaza al tramo, desde el `[` hasta el cursor. */
  insertar: string
  detalle?: string | undefined
}

export interface Sugerencias {
  /** `variable` o `columna` (de la tabla `tabla`). */
  clase: 'variable' | 'columna'
  tabla?: string
  /**
   * El tramo que se reemplaza al elegir: del `[` hasta el cursor (y el `]` que siga, si hay), o
   * con Ctrl+Espacio, el nombre sin corchetes entero.
   */
  inicio: number
  fin: number
  opciones: Opcion[]
}

/** Un nombre pegado al `[`: `Causas[` o `[Expedientes por estado][`. Entonces se piden columnas. */
const NOMBRE_ANTES = /(?:([\p{L}_][\p{L}\p{N}_.]*)|\[([^\][]+)\])$/u

/** Un nombre sin corchetes a medio escribir, justo antes del cursor, y lo que sigue de él. */
const NOMBRE_HASTA_CURSOR = /[\p{L}_][\p{L}\p{N}_.]*$/u
const NOMBRE_ENTERO = /^[\p{L}_][\p{L}\p{N}_.]*$/u
const RESTO_DEL_NOMBRE = /^[\p{L}\p{N}_.]*/u

/** Sin mayúsculas ni tildes: `alic` encuentra Alícuota. */
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Las que empiezan con lo escrito primero; después las que lo contienen. Sin nada escrito, todas. */
function filtrar<T>(items: readonly T[], texto: (t: T) => string, escrito: string): T[] {
  const buscado = normalizar(escrito.trim())
  if (!buscado) return [...items]
  const conTexto = items.map((i) => ({ i, t: normalizar(texto(i)) }))
  return [...conTexto.filter((c) => c.t.startsWith(buscado)), ...conTexto.filter((c) => !c.t.startsWith(buscado) && c.t.includes(buscado))].map((c) => c.i)
}

/** El cursor está adentro de un texto entre comillas (`""` es una comilla escrita, deja la cuenta igual). */
function dentroDeTexto(antes: string): boolean {
  return (antes.match(/"/g)?.length ?? 0) % 2 === 1
}

/**
 * Dónde empieza el nombre que se está escribiendo, para Ctrl+Espacio: con `Ne|`, en la N; sin nada
 * escrito, el cursor mismo. Adentro de un texto, null.
 */
export function inicioDeNombre(formula: string, cursor: number): number | null {
  const antes = formula.slice(0, cursor)
  if (dentroDeTexto(antes)) return null
  return cursor - (NOMBRE_HASTA_CURSOR.exec(antes)?.[0].length ?? 0)
}

/**
 * Qué ofrecer mientras se escribe un nombre entre corchetes: con el cursor después de un `[` sin
 * cerrar, las variables (o las columnas, si el `[` va pegado a una tabla), filtradas por lo que se
 * lleva escrito. Adentro de un texto, nada.
 *
 * `desde` es dónde empezaba el nombre al apretar Ctrl+Espacio (`inicioDeNombre`): fuera de un `[`,
 * se ofrecen las variables filtradas por lo escrito desde ahí, mientras siga siendo un nombre (un
 * espacio o un operador cierran la lista). Sin `desde` y fuera de un `[` abierto, nada.
 */
export function sugerir(formula: string, cursor: number, variables: readonly Candidata[], tablas: (nombre: string) => Tabla | undefined, desde?: number): Sugerencias | null {
  return entreCorchetes(formula, cursor, variables, tablas) ?? (desde === undefined ? null : sinCorchetes(formula, cursor, variables, desde))
}

function entreCorchetes(formula: string, cursor: number, variables: readonly Candidata[], tablas: (nombre: string) => Tabla | undefined): Sugerencias | null {
  const antes = formula.slice(0, cursor)
  const abre = antes.lastIndexOf('[')
  if (abre < 0 || antes.indexOf(']', abre) >= 0 || dentroDeTexto(antes.slice(0, abre))) return null
  const escrito = antes.slice(abre + 1)
  const fin = formula[cursor] === ']' ? cursor + 1 : cursor

  const previo = NOMBRE_ANTES.exec(formula.slice(0, abre))
  const nombreTabla = previo?.[1] ?? previo?.[2]
  const tabla = nombreTabla ? tablas(nombreTabla) : undefined
  if (nombreTabla && tabla) {
    const opciones = filtrar(tabla.columnas, (c) => c, escrito).map((c) => ({ etiqueta: c, insertar: `[${c}]` }))
    return { clase: 'columna', tabla: nombreTabla, inicio: abre, fin, opciones }
  }
  // Pegado a un nombre que no es una tabla no hay nada que ofrecer (sería un error).
  if (nombreTabla) return null
  // Se escribió el `[`: se respeta, aunque el nombre no lo necesite (`[Neto]` es lo mismo que `Neto`).
  const opciones = filtrar(variables, (v) => v.nombre, escrito).map((v) => ({ etiqueta: v.nombre, insertar: `[${v.nombre}]`, detalle: v.detalle }))
  return { clase: 'variable', inicio: abre, fin, opciones }
}

function sinCorchetes(formula: string, cursor: number, variables: readonly Candidata[], desde: number): Sugerencias | null {
  if (desde > cursor || dentroDeTexto(formula.slice(0, desde))) return null
  const escrito = formula.slice(desde, cursor)
  if (escrito && !NOMBRE_ENTERO.test(escrito)) return null
  // Con el cursor en el medio de un nombre (`Ne|to`), se reemplaza entero.
  const fin = cursor + (RESTO_DEL_NOMBRE.exec(formula.slice(cursor))?.[0].length ?? 0)
  const opciones = filtrar(variables, (v) => v.nombre, escrito).map((v) => ({ etiqueta: v.nombre, insertar: nombreEnFormula(v.nombre), detalle: v.detalle }))
  return { clase: 'variable', inicio: desde, fin, opciones }
}

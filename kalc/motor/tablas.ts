/**
 * Tablas: lo que devuelve una variable de tipo `tabla` (las filas de una consulta, una tabla escrita
 * a mano o una fórmula como FILTRAR). Se usan como las tablas de Excel: `Ventas[Importe]` es una
 * columna, `Ventas` la tabla entera. No son un `Valor`: solo las funciones que aceptan rangos (SUMA,
 * BUSCARV, CONTAR.SI…) las leen, y las operaciones (`Ventas[Importe] * 2`) van celda por celda.
 */

import { error, esTextoFecha, fecha, formatear, logico, numero, texto, textoANumero, VACIO, type Valor, type ValorError } from './valores.ts'

export interface Tabla {
  /** Los nombres de las columnas, como los devuelve la base (se buscan sin distinguir mayúsculas). */
  columnas: string[]
  /** Fila por fila, un valor por columna. NULL es vacío, como una celda sin nada. */
  filas: Valor[][]
}

/** Celdas fila por fila: una tabla entera, una de sus columnas, o el resultado de una operación. */
export type Rango = readonly (readonly Valor[])[]

/**
 * Los nombres de las columnas de un rango que sale de una tabla (`Ventas`, `Ventas[Importe]`,
 * `FILTRAR(Ventas; …)`): así una variable que es una fórmula conserva los nombres. Va aparte para
 * no cambiar `Rango`, que es parte de la API.
 */
const NOMBRES = new WeakMap<Rango, readonly string[]>()

/** Le asigna nombres a las columnas del rango y lo devuelve. */
export function conColumnas<R extends Rango>(r: R, columnas: readonly string[]): R {
  NOMBRES.set(r, columnas)
  return r
}

/** Los nombres de las columnas; si el rango no sale de una tabla, `Columna1`, `Columna2`… */
export function columnasDe(r: Rango): string[] {
  const nombres = NOMBRES.get(r)
  if (nombres && nombres.length === anchoDe(r)) return [...nombres]
  return Array.from({ length: anchoDe(r) }, (_, i) => `Columna${i + 1}`)
}

/** El rango como tabla, con los nombres de sus columnas. */
export function aTabla(r: Rango): Tabla {
  return { columnas: columnasDe(r), filas: r.map((f) => [...f]) }
}

/** Las filas de la tabla como rango, con sus nombres. */
export function rangoDeTabla(t: Tabla): Rango {
  return conColumnas(t.filas, t.columnas)
}

/** Una columna por su nombre; si no existe, #¡REF! (como en Excel, una columna que se borró). */
export function columnaDe(tabla: Tabla, nombre: string): Rango | ValorError {
  const i = indiceDeColumna(tabla.columnas, nombre)
  return i < 0 ? error('#¡REF!') : conColumnas(tabla.filas.map((f) => [f[i] ?? VACIO]), [tabla.columnas[i] as string])
}

/** La posición de la columna, sin distinguir mayúsculas; -1 si no está. */
export function indiceDeColumna(columnas: readonly string[], nombre: string): number {
  const n = nombre.toLowerCase()
  return columnas.findIndex((c) => c.toLowerCase() === n)
}

/**
 * Un rango usado como un valor suelto (`=Ventas[Importe]`, `Ventas[Importe] * 2` en una variable que
 * no es de tipo tabla): si es una sola celda, su valor; si no, #¡VALOR!.
 */
export function valorDeRango(r: Rango): Valor {
  const fila = r[0]
  return r.length === 1 && fila?.length === 1 ? (fila[0] as Valor) : error('#¡VALOR!')
}

/** Las celdas, fila por fila, en una sola lista. */
export function celdasDe(r: Rango): Valor[] {
  return r.flat()
}

/** Cantidad de columnas: la de la primera fila (todas tienen las mismas). */
export function anchoDe(r: Rango): number {
  return r[0]?.length ?? 0
}

// --- Tablas escritas a mano ----------------------------------------------------------------------

/**
 * Una tabla escrita como texto: la primera línea son los nombres de las columnas y cada una de las
 * siguientes, una fila. Las celdas se separan con `;` o con tabulaciones (lo que queda al pegar desde
 * Excel). Cada celda se lee como en una constante: `1.234,5`, `31/12/2026`, `VERDADERO`; vacía es
 * una celda vacía, y entre comillas (`"100"`) es un texto.
 */
export function leerDatos(escrito: string): { ok: true; tabla: Tabla } | { ok: false; mensaje: string } {
  const lineas = escrito.split(/\r?\n/).filter((l) => l.trim() !== '')
  const [encabezado, ...resto] = lineas
  if (encabezado === undefined) return { ok: false, mensaje: 'Falta la primera línea, con los nombres de las columnas' }
  const separador = encabezado.includes('\t') ? '\t' : ';'
  const columnas = partir(encabezado, separador).map((c) => c.texto.trim())
  const vacia = columnas.findIndex((c) => c === '')
  if (vacia >= 0) return { ok: false, mensaje: `Falta el nombre de la columna ${vacia + 1}` }
  const repetida = columnas.find((c, i) => indiceDeColumna(columnas, c) !== i)
  if (repetida) return { ok: false, mensaje: `Hay dos columnas que se llaman ${repetida}` }
  const filas: Valor[][] = []
  for (const [i, linea] of resto.entries()) {
    const celdas = partir(linea, separador)
    if (celdas.length > columnas.length) {
      return { ok: false, mensaje: `La fila ${i + 1} tiene ${celdas.length} valores y hay ${columnas.length} columnas` }
    }
    filas.push(columnas.map((_, j) => leerCelda(celdas[j])))
  }
  return { ok: true, tabla: { columnas, filas } }
}

/** La tabla como texto, para editarla: lo que `leerDatos` vuelve a leer igual. */
export function escribirDatos(tabla: Tabla): string {
  const celda = (v: Valor) => {
    const t = formatear(v)
    // Un texto que se leería como otra cosa (un número, una fecha) o con el separador va entre comillas.
    const necesita = v.tipo === 'texto' && (t.includes(';') || t.startsWith('"') || leerCelda({ texto: t, comillas: false }).tipo !== 'texto')
    return necesita ? `"${t.replaceAll('"', '""')}"` : t
  }
  return [tabla.columnas.join(';'), ...tabla.filas.map((f) => f.map(celda).join(';'))].join('\n')
}

interface CeldaEscrita {
  texto: string
  comillas: boolean
}

/** Parte una línea por el separador, respetando las comillas (`"a;b"`, `"dijo ""hola"""`). */
function partir(linea: string, separador: string): CeldaEscrita[] {
  const celdas: CeldaEscrita[] = []
  let i = 0
  for (;;) {
    while (linea[i] === ' ') i++
    if (linea[i] === '"') {
      let t = ''
      i++
      while (i < linea.length) {
        if (linea[i] === '"') {
          if (linea[i + 1] !== '"') break
          i++
        }
        t += linea[i++]
      }
      i++ // la comilla de cierre
      const fin = linea.indexOf(separador, i)
      celdas.push({ texto: t, comillas: true })
      if (fin < 0) break
      i = fin + separador.length
    } else {
      const fin = linea.indexOf(separador, i)
      celdas.push({ texto: linea.slice(i, fin < 0 ? undefined : fin), comillas: false })
      if (fin < 0) break
      i = fin + separador.length
    }
  }
  return celdas
}

function leerCelda(c: CeldaEscrita | undefined): Valor {
  if (!c) return VACIO
  if (c.comillas) return texto(c.texto)
  const t = c.texto.trim()
  if (t === '') return VACIO
  const u = t.toUpperCase()
  if (u === 'VERDADERO' || u === 'TRUE') return logico(true)
  if (u === 'FALSO' || u === 'FALSE') return logico(false)
  const n = textoANumero(t)
  if (n !== null) return esTextoFecha(t) ? fecha(n) : numero(n)
  return texto(t)
}

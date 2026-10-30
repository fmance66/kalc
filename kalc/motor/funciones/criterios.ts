/**
 * Criterios y coincidencias, como los entiende Excel: el criterio de `CONTAR.SI` / `SUMAR.SI`
 * (`5`, `">100"`, `"<>"`, `"a*"`) y la búsqueda de un valor en un rango (`BUSCARV`, `COINCIDIR`).
 */

import { comparar, ERRORES, esError, redondear15, textoANumero, type Valor } from '../valores.ts'

/** Si la celda cumple el criterio. */
export type Criterio = (celda: Valor) => boolean

type Operador = '=' | '<>' | '<' | '>' | '<=' | '>='

const OPERADOR = /^(<=|>=|<>|<|>|=)?(.*)$/s

/**
 * El criterio de `CONTAR.SI`, `SUMAR.SI`, etc. Un texto puede empezar con un operador (`">100"`,
 * `"<>Baja"`); sin operador es `=`. Como en Excel:
 * - Un número (o un texto que es un número, `"100"`, `"31/12/2026"`) con `=` coincide con las celdas
 *   que tienen ese número, también escrito como texto. Con `<`, `>`, etc., solo con números.
 * - Un texto con `=` o `<>` admite comodines: `*` (cualquier cosa), `?` (un carácter), `~*` (un
 *   asterisco). Sin distinguir mayúsculas.
 * - `""` o `"="` coincide con las celdas vacías; `"<>"`, con las que tienen algo.
 * - `<>` es la negación de `=`: `"<>5"` cuenta también las vacías y las de texto.
 */
export function criterio(v: Valor): Criterio {
  if (v.tipo !== 'texto') return igualA(v)
  const [, op = '=', operando = ''] = OPERADOR.exec(v.valor) ?? []
  const operador = op as Operador
  const igual = igualDeTexto(operando)
  if (operador === '=') return igual
  if (operador === '<>') return (c) => !igual(c)
  // < > <= >=: un número solo se compara con números; un texto, con textos.
  const n = textoANumero(operando)
  const valor: Valor = n !== null ? { tipo: 'numero', valor: n } : { tipo: 'texto', valor: operando }
  return (c) => {
    if (esError(c) || c.tipo === 'vacio') return false
    const deNumeros = c.tipo === 'numero' || c.tipo === 'fecha'
    if (deNumeros !== (n !== null) || (c.tipo !== 'texto' && !deNumeros)) return false
    return cumple(operador, comparar(c, valor))
  }
}

/** El criterio que no es texto: un número, una fecha, un lógico o un error. */
function igualA(v: Valor): Criterio {
  if (v.tipo === 'numero' || v.tipo === 'fecha') return igualANumero(v.valor)
  if (v.tipo === 'logico') return (c) => c.tipo === 'logico' && c.valor === v.valor
  if (v.tipo === 'error') return (c) => c.tipo === 'error' && c.valor === v.valor
  // Un criterio vacío se toma como "": cuenta las celdas vacías.
  return esVacia
}

/** Una celda vacía, o con un texto vacío (Excel no las distingue en los criterios). */
export const esVacia: Criterio = (c) => c.tipo === 'vacio' || (c.tipo === 'texto' && c.valor === '')

/** `=` con el operando escrito como texto: un número, un lógico, un error, vacío o un texto con comodines. */
function igualDeTexto(operando: string): Criterio {
  if (operando === '') return esVacia
  const n = textoANumero(operando)
  if (n !== null) return igualANumero(n)
  const u = operando.toUpperCase()
  if (u === 'VERDADERO' || u === 'TRUE') return igualA({ tipo: 'logico', valor: true })
  if (u === 'FALSO' || u === 'FALSE') return igualA({ tipo: 'logico', valor: false })
  const codigo = ERRORES[u]
  if (codigo) return igualA({ tipo: 'error', valor: codigo })
  const patron = comodines(operando)
  return (c) => c.tipo === 'texto' && patron.test(c.valor)
}

/** Un número: las celdas con ese número o con un texto que lo es (`"100"`), a 15 dígitos. */
function igualANumero(n: number): Criterio {
  const x = redondear15(n)
  return (c) => {
    if (c.tipo === 'numero' || c.tipo === 'fecha') return redondear15(c.valor) === x
    if (c.tipo !== 'texto') return false
    const t = textoANumero(c.valor)
    return t !== null && redondear15(t) === x
  }
}

/**
 * Los comodines de Excel como expresión regular, sin distinguir mayúsculas: `*` cualquier cosa,
 * `?` un carácter, `~` delante de `*`, `?` o `~` los toma literales. Con `entero` (por defecto) el
 * patrón tiene que coincidir con todo el texto, como en un criterio; sin él, con una parte, como
 * en HALLAR.
 */
export function comodines(patron: string, entero = true): RegExp {
  let r = ''
  for (let i = 0; i < patron.length; i++) {
    const c = patron[i] as string
    const siguiente = patron[i + 1]
    if (c === '~' && (siguiente === '*' || siguiente === '?' || siguiente === '~')) {
      r += escapar(siguiente)
      i++
    } else if (c === '*') r += '[\\s\\S]*'
    else if (c === '?') r += '[\\s\\S]'
    else r += escapar(c)
  }
  return new RegExp(entero ? `^${r}$` : r, 'iu')
}

// Con la bandera u solo se pueden escapar los caracteres especiales: \- daría error.
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

function cumple(op: Operador, c: number): boolean {
  switch (op) {
    case '=':
      return c === 0
    case '<>':
      return c !== 0
    case '<':
      return c < 0
    case '>':
      return c > 0
    case '<=':
      return c <= 0
    case '>=':
      return c >= 0
  }
}

// --- Búsqueda -----------------------------------------------------------------------------------

/** Números (y fechas), textos y lógicos: en una búsqueda solo se comparan los de la misma clase. */
function clase(v: Valor): number | null {
  if (v.tipo === 'numero' || v.tipo === 'fecha') return 0
  if (v.tipo === 'texto') return 1
  if (v.tipo === 'logico') return 2
  return null
}

/**
 * La posición (desde 0) de `buscado` en la lista, o -1. Como en Excel:
 * - `exacta`: la primera igual, del mismo tipo (el número 1 no encuentra el texto "1"), sin
 *   distinguir mayúsculas y con comodines si lo buscado es un texto.
 * - `menor`: la última menor o igual (los datos tienen que estar en orden ascendente).
 * - `mayor`: la última mayor o igual (en orden descendente).
 * En las aproximadas se recorre hasta pasarse; Excel hace una búsqueda binaria, y con los datos
 * ordenados (lo que pide) da lo mismo.
 */
export function buscar(buscado: Valor, lista: readonly Valor[], modo: 'exacta' | 'menor' | 'mayor'): number {
  const k = clase(buscado)
  if (k === null) return -1
  if (modo === 'exacta') {
    const igual = buscado.tipo === 'texto' ? ((p: RegExp) => (c: Valor) => c.tipo === 'texto' && p.test(c.valor))(comodines(buscado.valor)) : (c: Valor) => clase(c) === k && comparar(c, buscado) === 0
    return lista.findIndex(igual)
  }
  let encontrado = -1
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i] as Valor
    if (clase(c) !== k) continue
    const orden = comparar(c, buscado)
    if (modo === 'menor' ? orden > 0 : orden < 0) break
    encontrado = i
  }
  return encontrado
}

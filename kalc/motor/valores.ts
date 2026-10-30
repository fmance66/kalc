/**
 * Tipos de valor y coerciones. Excel tiene tipos aunque no se vean (número, texto, lógico,
 * error, celda vacía) y para dar sus mismos resultados hay que modelarlos.
 */

import { fechaASerie, serieAFecha } from './calendario.ts'

export type CodigoError = '#¡DIV/0!' | '#¡VALOR!' | '#¿NOMBRE?' | '#¡REF!' | '#N/D' | '#¡NUM!' | '#¡CICLO!'

export type Valor =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'texto'; valor: string }
  | { tipo: 'logico'; valor: boolean }
  /** Número de serie de Excel (días desde 1899-12-30, ver calendario.ts). Opera como número. */
  | { tipo: 'fecha'; valor: number }
  | { tipo: 'error'; valor: CodigoError }
  /** Como una celda vacía: 0 en aritmética, "" en texto, FALSO en lógica. */
  | { tipo: 'vacio' }

export type ValorError = Extract<Valor, { tipo: 'error' }>

/** Códigos de error que se aceptan escritos en una fórmula; el nombre en inglés es alias. */
export const ERRORES: Readonly<Record<string, CodigoError>> = {
  '#¡DIV/0!': '#¡DIV/0!',
  '#DIV/0!': '#¡DIV/0!',
  '#¡VALOR!': '#¡VALOR!',
  '#VALUE!': '#¡VALOR!',
  '#¿NOMBRE?': '#¿NOMBRE?',
  '#NAME?': '#¿NOMBRE?',
  '#¡REF!': '#¡REF!',
  '#REF!': '#¡REF!',
  '#N/D': '#N/D',
  '#N/A': '#N/D',
  '#¡NUM!': '#¡NUM!',
  '#NUM!': '#¡NUM!',
  '#¡CICLO!': '#¡CICLO!',
}

// --- Constructores ------------------------------------------------------------------------------

export const numero = (valor: number): Valor => ({ tipo: 'numero', valor })
export const texto = (valor: string): Valor => ({ tipo: 'texto', valor })
export const logico = (valor: boolean): Valor => ({ tipo: 'logico', valor })
export const fecha = (valor: number): Valor => ({ tipo: 'fecha', valor })
export const error = (valor: CodigoError): ValorError => ({ tipo: 'error', valor })
export const VACIO: Valor = { tipo: 'vacio' }

export const esError = (v: Valor): v is ValorError => v.tipo === 'error'

/** Excel no admite textos más largos (el & devuelve #¡VALOR!). */
export const LARGO_MAXIMO_TEXTO = 32_767

// --- Precisión ----------------------------------------------------------------------------------

/**
 * Excel trabaja con 15 dígitos significativos: 0,1 + 0,2 muestra 0,3 y `=0,1+0,2=0,3` da
 * VERDADERO. Se redondea así al mostrar y al comparar (no en los cálculos intermedios).
 */
export function redondear15(n: number): number {
  return n === 0 || !Number.isFinite(n) ? n : Number(n.toPrecision(15))
}

// --- Coerciones ---------------------------------------------------------------------------------

/**
 * A número, para la aritmética: `"3" + 1 = 4`, `VERDADERO + 1 = 2`, vacío = 0. Un texto que no
 * es un número (ni una fecha) da #¡VALOR!, incluido "" y "VERDADERO".
 */
export function aNumero(v: Valor): number | ValorError {
  switch (v.tipo) {
    case 'numero':
    case 'fecha':
      return v.valor
    case 'logico':
      return v.valor ? 1 : 0
    case 'vacio':
      return 0
    case 'error':
      return v
    case 'texto':
      return textoANumero(v.valor) ?? error('#¡VALOR!')
  }
}

/** A texto, para el &: los números como en el formato General de Excel (`1,5`, `1E+15`). */
export function aTexto(v: Valor): string | ValorError {
  switch (v.tipo) {
    case 'texto':
      return v.valor
    // Una fecha en Excel es un número con formato: concatenada aparece el número de serie.
    case 'numero':
    case 'fecha':
      return numeroATexto(v.valor)
    case 'logico':
      return v.valor ? 'VERDADERO' : 'FALSO'
    case 'vacio':
      return ''
    case 'error':
      return v
  }
}

/** dd/mm/aaaa o dd-mm-aaaa. */
const FECHA_ESCRITA = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/

/** Si el texto es una fecha válida escrita como dd/mm/aaaa. */
export function esTextoFecha(s: string): boolean {
  return FECHA_ESCRITA.test(s.trim()) && textoANumero(s) !== null
}

/**
 * Un texto escrito como lo entendería Excel en castellano (Argentina): `1.234,5`, `-3`, `50%`,
 * `1,5E+3`, `$ 100`, o una fecha `31/12/2026`. `null` si no es un número.
 */
export function textoANumero(s: string): number | null {
  const t = s.trim()
  const n = /^([+-])?\$?\s*(\d{1,3}(?:\.\d{3})+|\d*)(?:,(\d+))?(?:[eE]([+-]?\d+))?\s*(%)?$/.exec(t)
  if (n && (n[2] || n[3])) {
    const [, signo, entera = '', decimales = '', exponente, porcentaje] = n
    let valor = Number(`${entera.replaceAll('.', '') || '0'}.${decimales || '0'}e${exponente ?? '0'}`)
    if (signo === '-') valor = -valor
    if (porcentaje) valor /= 100
    return Number.isFinite(valor) ? valor : null
  }
  const f = FECHA_ESCRITA.exec(t)
  if (f) return fechaASerie({ dia: Number(f[1]), mes: Number(f[2]), anio: Number(f[3]) })
  return null
}

/**
 * Un número como lo escribe Excel en una concatenación (formato General, 15 dígitos
 * significativos, coma decimal, sin separador de miles). Notación científica desde 1E+15 y por
 * debajo de 1E-9.
 */
export function numeroATexto(n: number): string {
  const r = redondear15(n)
  if (r === 0) return '0' // también -0
  const abs = Math.abs(r)
  if (abs >= 1e15 || abs < 1e-9) {
    const [mantisa = '', exp = '0'] = r.toExponential().split('e')
    const e = Number(exp)
    return `${mantisa.replace('.', ',')}E${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`
  }
  return sinExponente(r).replace('.', ',')
}

/** El número en notación decimal: `String(1e-7)` da "1e-7". */
function sinExponente(n: number): string {
  const s = String(n)
  if (!s.includes('e')) return s
  const [mantisa = '', exp = '0'] = n.toExponential().split('e')
  const signo = mantisa.startsWith('-') ? '-' : ''
  const digitos = mantisa.replace(/[-.]/g, '')
  const e = Number(exp)
  if (e < 0) return `${signo}0.${'0'.repeat(-e - 1)}${digitos}`
  return `${signo}${digitos.padEnd(e + 1, '0')}`
}

// --- Comparación ------------------------------------------------------------------------------

/** Orden entre tipos distintos en Excel: número < texto < lógico, sin convertir. */
const RANGO: Record<Exclude<Valor['tipo'], 'error' | 'vacio'>, number> = { numero: 0, fecha: 0, texto: 1, logico: 2 }

/** -1, 0 o 1. Los errores ya se descartaron antes. */
export function comparar(a: Valor, b: Valor): number {
  // Vacío se compara como el valor "cero" del otro tipo: 0, "" o FALSO.
  if (a.tipo === 'vacio') a = vacioComo(b)
  if (b.tipo === 'vacio') b = vacioComo(a)
  if (a.tipo === 'error' || b.tipo === 'error' || a.tipo === 'vacio' || b.tipo === 'vacio') return 0
  const ra = RANGO[a.tipo]
  const rb = RANGO[b.tipo]
  if (ra !== rb) return Math.sign(ra - rb)
  if (a.tipo === 'texto' && b.tipo === 'texto') {
    // Sin distinguir mayúsculas ("a" = "A"), pero sí acentos.
    return Math.sign(a.valor.localeCompare(b.valor, 'es', { sensitivity: 'accent' }))
  }
  // Números y fechas a 15 dígitos: 0,1 + 0,2 = 0,3 da VERDADERO.
  const x = redondear15(Number(a.valor))
  const y = redondear15(Number(b.valor))
  return Math.sign(x - y)
}

function vacioComo(otro: Valor): Valor {
  if (otro.tipo === 'texto') return texto('')
  if (otro.tipo === 'logico') return logico(false)
  return numero(0)
}

// --- Para mostrar -------------------------------------------------------------------------------

/**
 * El valor para mostrar en pantalla: `1234,56`, `31/12/2026`, `VERDADERO`, `#¡DIV/0!`. Los números
 * en formato General, como Excel: sin separador de miles (un año se ve 2026, no 2.026).
 */
export function formatear(v: Valor): string {
  switch (v.tipo) {
    case 'numero':
      return numeroATexto(v.valor)
    case 'fecha': {
      const f = serieAFecha(v.valor)
      // Como Excel: una fecha fuera de rango se muestra como ######.
      if (!f) return '######'
      const dos = (x: number) => String(x).padStart(2, '0')
      return `${dos(f.dia)}/${dos(f.mes)}/${f.anio}`
    }
    case 'texto':
      return v.valor
    case 'logico':
      return v.valor ? 'VERDADERO' : 'FALSO'
    case 'error':
      return v.valor
    case 'vacio':
      return ''
  }
}

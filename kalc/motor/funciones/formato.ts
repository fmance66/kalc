/**
 * Códigos de formato de Excel en castellano (Argentina), para TEXTO: `,` decimal, `.` de miles,
 * `aaaa` para el año. Se cubre lo común: `0`, `#`, `?`, miles, `%`, texto entre comillas,
 * secciones `positivo;negativo;cero`, y fechas y horas (`dd/mm/aaaa`, `mmmm`, `hh:mm:ss`).
 * Sin colores, condiciones (`[>100]`) ni AM/PM: esas partes se ignoran.
 */

import { serieAFecha } from '../calendario.ts'
import { numeroATexto } from '../valores.ts'
import { redondearA } from './comunes.ts'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

type Pieza =
  | { clase: 'literal'; texto: string }
  | { clase: 'digito'; c: '0' | '#' | '?' }
  | { clase: 'decimal' }
  | { clase: 'miles' }
  | { clase: 'porcentaje' }
  /** d, mm, aaaa, hh, ss… en minúsculas, con la `y` inglesa pasada a `a`. */
  | { clase: 'fecha'; codigo: string }

/** El número con el formato, o `null` si no se puede (una fecha negativa). */
export function aplicarFormato(n: number, formato: string): string | null {
  const secciones = partirSecciones(formato)
  let seccion = secciones[0] ?? ''
  let x = n
  let signo = n < 0
  // Con dos o más secciones, la segunda es para los negativos y lleva el signo ella (o no).
  if (n < 0 && secciones.length >= 2) {
    seccion = secciones[1] ?? ''
    x = -n
    signo = false
  } else if (n === 0 && secciones.length >= 3) {
    seccion = secciones[2] ?? ''
  }
  if (/^\s*(general|estándar|estandar)\s*$/i.test(seccion)) return numeroATexto(x)
  const piezas = leerPiezas(seccion)
  if (piezas.some((p) => p.clase === 'fecha')) return formatoFecha(x, piezas)
  const texto = formatoNumero(Math.abs(x), piezas)
  return signo && texto !== '' ? `-${texto}` : texto
}

/** Separa por `;` fuera de las comillas. */
function partirSecciones(formato: string): string[] {
  const secciones = ['']
  let comillas = false
  for (let i = 0; i < formato.length; i++) {
    const c = formato[i] ?? ''
    if (c === '"') comillas = !comillas
    if (c === '\\' && !comillas) {
      secciones[secciones.length - 1] += c + (formato[++i] ?? '')
      continue
    }
    if (c === ';' && !comillas) secciones.push('')
    else secciones[secciones.length - 1] += c
  }
  return secciones
}

function leerPiezas(seccion: string): Pieza[] {
  const piezas: Pieza[] = []
  let hayDecimal = false
  let i = 0
  while (i < seccion.length) {
    const c = seccion[i] ?? ''
    const minuscula = c.toLowerCase()
    if (c === '"') {
      const cierre = seccion.indexOf('"', i + 1)
      const fin = cierre < 0 ? seccion.length : cierre
      piezas.push({ clase: 'literal', texto: seccion.slice(i + 1, fin) })
      i = fin + 1
    } else if (c === '\\') {
      piezas.push({ clase: 'literal', texto: seccion[i + 1] ?? '' })
      i += 2
    } else if (c === '[') {
      // Colores y condiciones: no se aplican.
      const cierre = seccion.indexOf(']', i)
      i = cierre < 0 ? seccion.length : cierre + 1
    } else if (c === '_') {
      // "Dejar el ancho de este carácter": un espacio.
      piezas.push({ clase: 'literal', texto: ' ' })
      i += 2
    } else if (c === '*') {
      // Repetir hasta llenar la celda: acá no hay celda.
      i += 2
    } else if ('dmahs'.includes(minuscula)) {
      let j = i
      while (j < seccion.length && (seccion[j] ?? '').toLowerCase() === minuscula) j++
      piezas.push({ clase: 'fecha', codigo: seccion.slice(i, j).toLowerCase() })
      i = j
    } else if (minuscula === 'y') {
      let j = i
      while (j < seccion.length && (seccion[j] ?? '').toLowerCase() === 'y') j++
      piezas.push({ clase: 'fecha', codigo: 'a'.repeat(j - i) })
      i = j
    } else {
      if (c === '0' || c === '#' || c === '?') piezas.push({ clase: 'digito', c })
      else if (c === ',' && !hayDecimal) {
        piezas.push({ clase: 'decimal' })
        hayDecimal = true
      } else if (c === '.' && !hayDecimal) piezas.push({ clase: 'miles' })
      else if (c === '%') piezas.push({ clase: 'porcentaje' })
      else piezas.push({ clase: 'literal', texto: c })
      i++
    }
  }
  return piezas
}

function formatoNumero(x: number, piezas: Pieza[]): string {
  for (const p of piezas) if (p.clase === 'porcentaje') x *= 100
  const iDecimal = piezas.findIndex((p) => p.clase === 'decimal')
  const entera = iDecimal < 0 ? piezas : piezas.slice(0, iDecimal)
  const fraccion = iDecimal < 0 ? [] : piezas.slice(iDecimal + 1)

  // Un punto después del último dígito de la parte entera divide por mil (`0.` muestra miles);
  // entre dígitos, agrupa de a tres.
  let ultimoDigito = -1
  entera.forEach((p, i) => {
    if (p.clase === 'digito') ultimoDigito = i
  })
  const agrupar = entera.some((p, i) => p.clase === 'miles' && i < ultimoDigito)
  for (const p of entera.slice(ultimoDigito + 1)) if (p.clase === 'miles') x /= 1000

  const marcadoresFraccion = fraccion.flatMap((p) => (p.clase === 'digito' ? [p.c] : []))
  const r = redondearA(x, marcadoresFraccion.length, 'mitad')
  const [digitosEnteros = '0', digitosFraccion = ''] = r.toFixed(marcadoresFraccion.length).split('.')

  const parteEntera = agrupar ? enteraAgrupada(entera, digitosEnteros) : enteraPorMarcador(entera, digitosEnteros)
  const parteFraccion = fraccionPorMarcador(fraccion, marcadoresFraccion, digitosFraccion)
  return iDecimal < 0 ? parteEntera : `${parteEntera},${parteFraccion}`
}

/**
 * Llena los marcadores de derecha a izquierda; los dígitos que sobran van en el primero
 * (`00-00` con 12345 da `123-45`). Un 0 a la izquierda solo aparece si lo pide un `0`.
 */
function enteraPorMarcador(piezas: Pieza[], digitos: string): string {
  let pendientes = digitos === '0' ? '' : digitos
  const primero = piezas.findIndex((p) => p.clase === 'digito')
  if (primero < 0) return piezas.map(textoDe).join('') + pendientes
  const salida: string[] = []
  for (let i = piezas.length - 1; i >= 0; i--) {
    const p = piezas[i]
    if (!p) continue
    if (p.clase !== 'digito') {
      salida.unshift(textoDe(p))
      continue
    }
    let d: string
    if (i === primero) {
      d = pendientes || relleno(p.c)
      pendientes = ''
    } else if (pendientes) {
      d = pendientes.slice(-1)
      pendientes = pendientes.slice(0, -1)
    } else {
      d = relleno(p.c)
    }
    salida.unshift(d)
  }
  return salida.join('')
}

/** Con separador de miles: el número entero en el lugar del primer marcador, con los literales alrededor. */
function enteraAgrupada(piezas: Pieza[], digitos: string): string {
  const ceros = piezas.filter((p) => p.clase === 'digito' && p.c === '0').length
  const numero = (digitos === '0' ? '' : digitos).padStart(ceros, '0')
  const agrupado = numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const primero = piezas.findIndex((p) => p.clase === 'digito')
  return piezas.map((p, i) => (i === primero ? agrupado : p.clase === 'digito' ? '' : textoDe(p))).join('')
}

/** Los ceros del final se borran donde el marcador es `#` y son espacio donde es `?`. */
function fraccionPorMarcador(piezas: Pieza[], marcadores: string[], digitos: string): string {
  const ds = [...digitos]
  for (let j = ds.length - 1; j >= 0 && ds[j] === '0'; j--) {
    if (marcadores[j] === '#') ds[j] = ''
    else if (marcadores[j] === '?') ds[j] = ' '
    else break
  }
  let k = 0
  return piezas.map((p) => (p.clase === 'digito' ? (ds[k++] ?? '') : textoDe(p))).join('')
}

function relleno(c: '0' | '#' | '?'): string {
  return c === '0' ? '0' : c === '?' ? ' ' : ''
}

function textoDe(p: Pieza): string {
  switch (p.clase) {
    case 'literal':
      return p.texto
    case 'porcentaje':
      return '%'
    case 'miles':
      return ''
    case 'decimal':
      return ','
    default:
      return ''
  }
}

function formatoFecha(serie: number, piezas: Pieza[]): string | null {
  if (serie < 0) return null
  const dias = Math.floor(serie)
  // La serie 0 Excel la muestra como 00/01/1900.
  const f = dias === 0 ? { anio: 1900, mes: 1, dia: 0 } : serieAFecha(dias)
  if (!f) return null
  const segundos = Math.round((serie - dias) * 86_400)
  const hora = Math.floor(segundos / 3600) % 24
  const minuto = Math.floor(segundos / 60) % 60
  const segundo = segundos % 60
  // Excel cuenta la serie 1 (01/01/1900) como domingo.
  const diaSemana = (dias + 6) % 7
  const dos = (n: number) => String(n).padStart(2, '0')
  const codigos = piezas.flatMap((p, i) => (p.clase === 'fecha' ? [{ p, i }] : []))

  return piezas
    .map((p, i) => {
      if (p.clase !== 'fecha') return textoDe(p)
      const { codigo } = p
      const largo = codigo.length
      switch (codigo[0]) {
        case 'd':
          if (largo === 1) return String(f.dia)
          if (largo === 2) return dos(f.dia)
          return largo === 3 ? (DIAS[diaSemana] ?? '').slice(0, 3) : (DIAS[diaSemana] ?? '')
        case 'm': {
          // m y mm son minutos después de una hora o antes de segundos (`hh:mm`, `mm:ss`).
          const k = codigos.findIndex((c) => c.i === i)
          const antes = codigos[k - 1]?.p.codigo[0]
          const despues = codigos[k + 1]?.p.codigo[0]
          if (largo <= 2 && (antes === 'h' || despues === 's')) return largo === 1 ? String(minuto) : dos(minuto)
          if (largo === 1) return String(f.mes)
          if (largo === 2) return dos(f.mes)
          const nombre = MESES[f.mes - 1] ?? ''
          return largo === 3 ? nombre.slice(0, 3) : largo === 4 ? nombre : nombre.slice(0, 1)
        }
        case 'a':
          return largo <= 2 ? dos(f.anio % 100) : String(f.anio)
        case 'h':
          return largo === 1 ? String(hora) : dos(hora)
        case 's':
          return largo === 1 ? String(segundo) : dos(segundo)
        default:
          return codigo
      }
    })
    .join('')
}

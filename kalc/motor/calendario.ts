/**
 * Números de serie de fecha de Excel (sistema 1900): la serie 1 es el 01/01/1900.
 *
 * Excel arrastra un error de Lotus 1-2-3: cree que 1900 fue bisiesto, así que la serie 60 es el
 * inexistente 29/02/1900 y desde la 61 (01/03/1900) todo queda corrido un día. Se respeta para que
 * los números coincidan con los de Excel: desde el 01/03/1900 la serie es "días desde el
 * 30/12/1899", y antes, "días desde el 31/12/1899".
 */

export interface FechaCivil {
  anio: number
  mes: number // 1-12
  dia: number // 1-31
}

const MS_POR_DIA = 86_400_000
/** 30/12/1899: el día 0 para las series desde la 61. */
const EPOCA = Date.UTC(1899, 11, 30)
/** Serie del falso 29/02/1900. */
const SERIE_29_FEB_1900 = 60
/** Último día que Excel acepta: 31/12/9999. */
export const SERIE_MAXIMA = 2_958_465

/** La serie de una fecha, o `null` si no existe (31/02) o está fuera del rango de Excel. */
export function fechaASerie({ anio, mes, dia }: FechaCivil): number | null {
  if (anio === 1900 && mes === 2 && dia === 29) return SERIE_29_FEB_1900
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null
  const ms = Date.UTC(anio, mes - 1, dia)
  const d = new Date(ms)
  // Date.UTC "corrige" los días de más (31/02 → 03/03): eso es una fecha inválida.
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  // Date.UTC trata los años 0-99 como 1900-1999.
  if (anio < 1900 || anio > 9999) return null
  let serie = Math.round((ms - EPOCA) / MS_POR_DIA)
  if (serie <= SERIE_29_FEB_1900) serie-- // antes del 01/03/1900 no hay día fantasma que compensar
  return serie
}

/** La fecha de una serie (se descarta la parte fraccionaria: la hora). `null` fuera de rango. */
export function serieAFecha(serie: number): FechaCivil | null {
  const dias = Math.floor(serie)
  if (dias < 1 || dias > SERIE_MAXIMA) return null
  if (dias === SERIE_29_FEB_1900) return { anio: 1900, mes: 2, dia: 29 }
  const d = new Date(EPOCA + (dias < SERIE_29_FEB_1900 ? dias + 1 : dias) * MS_POR_DIA)
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() }
}

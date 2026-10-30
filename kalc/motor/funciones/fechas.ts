/** Fechas: HOY, FECHA, AÑO, MES, DIA, DIAS, FIN.MES, FECHA.MES. Trabajan con números de serie. */

import { fechaASerie, SERIE_MAXIMA, serieAFecha, type FechaCivil } from '../calendario.ts'
import { argEntero, argNumero } from './comunes.ts'
import type { Argumento, DefinicionFuncion } from './registro.ts'
import { error, fecha, numero, type Valor, type ValorError } from '../valores.ts'

/**
 * La fecha del argumento (un número de serie, una fecha o un texto "31/12/2026"). La serie 0 es
 * el 00/01/1900 de Excel (AÑO da 1900, DIA da 0); negativa o pasada del 31/12/9999, #¡NUM!.
 */
function argFecha(a: Argumento | undefined): FechaCivil | ValorError {
  const n = argNumero(a)
  if (typeof n !== 'number') return n
  const dias = Math.floor(n)
  if (dias === 0) return { anio: 1900, mes: 1, dia: 0 }
  return serieAFecha(dias) ?? error('#¡NUM!')
}

/** La serie del día 1 de un mes, con el mes desbordado como en Excel (mes 13 = enero del año siguiente). */
function serieDelMes(anio: number, mes: number): number | null {
  const meses = anio * 12 + (mes - 1)
  return fechaASerie({ anio: Math.floor(meses / 12), mes: (((meses % 12) + 12) % 12) + 1, dia: 1 })
}

/** Días que tiene el mes (Excel cree que febrero de 1900 tuvo 29). */
function diasDelMes(anio: number, mes: number): number {
  if (anio === 1900 && mes === 2) return 29
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

function enRango(serie: number | null): Valor {
  return serie === null || serie < 0 || serie > SERIE_MAXIMA ? error('#¡NUM!') : fecha(serie)
}

/** AÑO, MES, DIA. */
function parte(nombre: string, alias: string, descripcion: string, ejemplo: string, de: (f: FechaCivil) => number): DefinicionFuncion {
  return {
    nombre,
    alias: [alias],
    minimo: 1,
    maximo: 1,
    categoria: 'Fechas',
    porCelda: true,
    firma: `${nombre}(fecha)`,
    descripcion,
    ejemplo,
    evaluar: ([a]) => {
      const f = argFecha(a)
      return 'tipo' in f ? f : numero(de(f))
    },
  }
}

/** FECHA.MES y FIN.MES: la fecha corrida tantos meses, con el día que corresponda. */
function correrMeses(args: readonly Argumento[], dia: (f: FechaCivil, diasDelMes: number) => number): Valor {
  const [inicio, meses] = args
  const f = argFecha(inicio)
  if ('tipo' in f) return f
  const m = argEntero(meses)
  if (typeof m !== 'number') return m
  const primero = serieDelMes(f.anio, f.mes + m)
  const civil = primero === null ? null : serieAFecha(primero)
  if (primero === null || !civil) return error('#¡NUM!')
  return enRango(primero + dia(f, diasDelMes(civil.anio, civil.mes)) - 1)
}

export const FECHAS: DefinicionFuncion[] = [
  {
    nombre: 'HOY',
    alias: ['TODAY'],
    minimo: 0,
    maximo: 0,
    categoria: 'Fechas',
    firma: 'HOY()',
    descripcion: 'La fecha de hoy (sin hora). Se recalcula en cada evaluación.',
    ejemplo: 'HOY()',
    volatil: true,
    evaluar: () => {
      // La fecha local: a las 22 h en Argentina, en UTC ya es mañana.
      const ahora = new Date()
      return enRango(fechaASerie({ anio: ahora.getFullYear(), mes: ahora.getMonth() + 1, dia: ahora.getDate() }))
    },
  },
  {
    nombre: 'FECHA',
    alias: ['DATE'],
    minimo: 3,
    maximo: 3,
    categoria: 'Fechas',
    firma: 'FECHA(año; mes; día)',
    descripcion: 'Arma una fecha. El mes y el día pueden pasarse de rango: FECHA(2026; 13; 1) es el 01/01/2027 y el día 0 es el último del mes anterior.',
    ejemplo: 'FECHA(2026; 3; 0)',
    evaluar: ([a, m, d]) => {
      let anio = argEntero(a)
      if (typeof anio !== 'number') return anio
      const mes = argEntero(m)
      if (typeof mes !== 'number') return mes
      const dia = argEntero(d)
      if (typeof dia !== 'number') return dia
      // Como Excel: un año de 0 a 1899 se suma a 1900 (FECHA(126;1;1) es 2026).
      if (anio >= 0 && anio < 1900) anio += 1900
      if (anio < 0 || anio > 9999) return error('#¡NUM!')
      const primero = serieDelMes(anio, mes)
      // FECHA(1900;1;0) es la serie 0; antes de eso, #¡NUM!.
      if (primero === null) return error('#¡NUM!')
      return enRango(primero + dia - 1)
    },
  },
  parte('AÑO', 'YEAR', 'El año de una fecha.', 'AÑO(FECHA(2026; 12; 31))', (f) => f.anio),
  parte('MES', 'MONTH', 'El mes de una fecha, de 1 a 12.', 'MES("31/12/2026")', (f) => f.mes),
  parte('DIA', 'DAY', 'El día del mes de una fecha, de 1 a 31.', 'DIA(FECHA(2026; 3; 0))', (f) => f.dia),
  {
    nombre: 'DIAS',
    alias: ['DAYS'],
    minimo: 2,
    maximo: 2,
    categoria: 'Fechas',
    firma: 'DIAS(fecha_final; fecha_inicial)',
    descripcion: 'Los días entre dos fechas (negativo si la final es anterior).',
    ejemplo: 'DIAS("31/12/2026"; "1/1/2026")',
    evaluar: ([fin, inicio]) => {
      const a = argNumero(fin)
      if (typeof a !== 'number') return a
      const b = argNumero(inicio)
      if (typeof b !== 'number') return b
      if (a < 0 || b < 0 || a > SERIE_MAXIMA + 1 || b > SERIE_MAXIMA + 1) return error('#¡NUM!')
      return numero(Math.floor(a) - Math.floor(b))
    },
  },
  {
    nombre: 'FIN.MES',
    alias: ['EOMONTH'],
    minimo: 2,
    maximo: 2,
    categoria: 'Fechas',
    firma: 'FIN.MES(fecha_inicial; meses)',
    descripcion: 'El último día del mes, tantos meses antes (negativo) o después de la fecha.',
    ejemplo: 'FIN.MES("15/01/2028"; 1)',
    evaluar: (args) => correrMeses(args, (_, ultimo) => ultimo),
  },
  {
    nombre: 'FECHA.MES',
    alias: ['EDATE'],
    minimo: 2,
    maximo: 2,
    categoria: 'Fechas',
    firma: 'FECHA.MES(fecha_inicial; meses)',
    descripcion: 'La misma fecha, tantos meses antes o después. Si el día no existe en ese mes, el último: 31/01 + 1 mes = 28/02 (o 29).',
    ejemplo: 'FECHA.MES("31/01/2026"; 1)',
    evaluar: (args) => correrMeses(args, (f, ultimo) => Math.min(f.dia, ultimo)),
  },
]

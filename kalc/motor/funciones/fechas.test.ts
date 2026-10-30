import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluar } from '../evaluador.ts'
import { fecha, formatear, type Valor } from '../valores.ts'

/** El resultado formateado, para escribir las tablas de casos más cortas. */
const ver = (formula: string, variables: Record<string, Valor> = {}) => formatear(evaluar(formula, { variables }))

describe('funciones de fecha', () => {
  it.each([
    ['FECHA(2026; 12; 31)', '31/12/2026'],
    ['FECHA(2026; 12; 31)*1', '46387'],
    // Mes y día se desbordan como en Excel.
    ['FECHA(2026; 13; 1)', '01/01/2027'],
    ['FECHA(2026; 3; 0)', '28/02/2026'],
    ['FECHA(2026; 0; 1)', '01/12/2025'],
    ['FECHA(2024; 2; 29)', '29/02/2024'],
    ['FECHA(126; 1; 1)', '01/01/2026'],
    ['FECHA(1900; 2; 29)*1', '60'],
    ['FECHA(1900; 3; 1)*1', '61'],
    ['FECHA(1900; 1; 0)*1', '0'],
    ['FECHA(1900; 0; 1)', '#¡NUM!'],
    ['FECHA(10000; 1; 1)', '#¡NUM!'],
    ['AÑO(FECHA(2026; 12; 31))', '2026'],
    ['año(46387)', '2026'],
    ['MES("31/12/2026")', '12'],
    ['DIA(FECHA(2026; 3; 0))', '28'],
    ['DIA(0)', '0'],
    ['AÑO(-1)', '#¡NUM!'],
    ['MES("abc")', '#¡VALOR!'],
    ['DIAS("31/12/2026"; "1/1/2026")', '364'],
    ['DIAS(10; 20,9)', '-10'],
    ['FIN.MES("15/01/2028"; 1)', '29/02/2028'],
    ['FIN.MES("15/01/2026"; -1)', '31/12/2025'],
    ['FECHA.MES("31/01/2026"; 1)', '28/02/2026'],
    ['FECHA.MES("31/03/2026"; -1)', '28/02/2026'],
    ['FECHA.MES("15/06/2026"; 12)', '15/06/2027'],
    ['FECHA.MES("15/06/9999"; 12)', '#¡NUM!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('las fechas de una variable funcionan igual', () => {
    expect(ver('FIN.MES(F; 0)', { F: fecha(46370) })).toBe('31/12/2026')
  })

  describe('HOY', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('es la fecha local, sin hora', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 11, 31, 23, 30))
      expect(evaluar('HOY()')).toEqual(fecha(46387))
    })
  })
})

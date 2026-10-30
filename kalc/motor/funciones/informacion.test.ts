import { describe, expect, it } from 'vitest'
import { evaluar } from '../evaluador.ts'
import { fecha, formatear, VACIO, type Valor } from '../valores.ts'

/** El resultado formateado, para escribir las tablas de casos más cortas. */
const ver = (formula: string, variables: Record<string, Valor> = {}) => formatear(evaluar(formula, { variables }))

describe('funciones de información', () => {
  const variables = { V: VACIO, F: fecha(46387) }

  it.each([
    ['ESNUMERO(1)', 'VERDADERO'],
    ['ESNUMERO("1")', 'FALSO'],
    ['ESNUMERO(F)', 'VERDADERO'],
    ['ESTEXTO("1")', 'VERDADERO'],
    ['ESTEXTO(1)', 'FALSO'],
    ['ESBLANCO(V)', 'VERDADERO'],
    ['ESBLANCO("")', 'FALSO'],
    ['ESERROR(1/0)', 'VERDADERO'],
    ['ESERROR(#N/D)', 'VERDADERO'],
    ['ESERROR(1)', 'FALSO'],
    // No propagan el error: lo inspeccionan.
    ['ESNUMERO(1/0)', 'FALSO'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula, variables)).toBe(esperado)
  })
})

/**
 * Los casos raros de Excel, uno por uno. Resultados esperados según el comportamiento documentado
 * de Excel 365 (es-AR).
 */

import { describe, expect, it } from 'vitest'
import { evaluar } from './evaluador.ts'
import { formatear, type Valor } from './valores.ts'

const CASOS: [formula: string, esperado: Valor][] = [
  // El menos unario va antes que ^.
  ['=-2^2', { tipo: 'numero', valor: 4 }],
  ['=0-2^2', { tipo: 'numero', valor: -4 }],
  // ^ asocia a izquierda.
  ['=2^3^2', { tipo: 'numero', valor: 64 }],
  // Entre tipos distintos no hay conversión: todo texto es mayor que todo número.
  ['="1">99999', { tipo: 'logico', valor: true }],
  ['=VERDADERO>"zzz"', { tipo: 'logico', valor: true }],
  // 15 dígitos significativos al comparar.
  ['=0,1+0,2=0,3', { tipo: 'logico', valor: true }],
  ['="a"="A"', { tipo: 'logico', valor: true }],
  // Coerción en aritmética.
  ['="3"+1', { tipo: 'numero', valor: 4 }],
  ['=VERDADERO+1', { tipo: 'numero', valor: 2 }],
  ['="abc"+1', { tipo: 'error', valor: '#¡VALOR!' }],
  ['=1/0', { tipo: 'error', valor: '#¡DIV/0!' }],
  ['=50%', { tipo: 'numero', valor: 0.5 }],
  ['=1&2', { tipo: 'texto', valor: '12' }],
  ['=1,5&""', { tipo: 'texto', valor: '1,5' }],
  // SI evalúa solo la rama que corresponde; Y y O evalúan todo (no hacen cortocircuito).
  ['=SI(VERDADERO;1;1/0)', { tipo: 'numero', valor: 1 }],
  ['=Y(FALSO;1/0)', { tipo: 'error', valor: '#¡DIV/0!' }],
  ['=SI(FALSO;1)', { tipo: 'logico', valor: false }],
  // REDONDEAR aleja la mitad del cero (no es Math.round), sobre los 15 dígitos que se ven.
  ['=REDONDEAR(2,5;0)', { tipo: 'numero', valor: 3 }],
  ['=REDONDEAR(-2,5;0)', { tipo: 'numero', valor: -3 }],
  ['=REDONDEAR(2,675;2)', { tipo: 'numero', valor: 2.68 }],
  // Un texto en SUMA: escrito directo se convierte; desde una variable se ignora (ver matematicas.test.ts).
  ['=SUMA("3";1)', { tipo: 'numero', valor: 4 }],
]

describe('casos raros de Excel', () => {
  it.each(CASOS)('%s', (formula, esperado) => {
    expect(evaluar(formula)).toEqual(esperado)
  })

  it('0,1+0,2 se muestra como 0,3', () => {
    expect(formatear(evaluar('=0,1+0,2'))).toBe('0,3')
  })

  it('la serie 60 es el inexistente 29/02/1900, y la 61 el 01/03/1900', () => {
    expect(formatear({ tipo: 'fecha', valor: 60 })).toBe('29/02/1900')
    expect(formatear({ tipo: 'fecha', valor: 61 })).toBe('01/03/1900')
    expect(evaluar('="1/3/1900"+0')).toEqual({ tipo: 'numero', valor: 61 })
    expect(evaluar('=FECHA(1900;2;29)')).toEqual({ tipo: 'fecha', valor: 60 })
  })
})

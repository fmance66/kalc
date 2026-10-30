import { describe, expect, it } from 'vitest'
import { evaluar } from '../evaluador.ts'
import { formatear, numero, texto, VACIO, type Valor } from '../valores.ts'

/** El resultado formateado, para escribir las tablas de casos más cortas. */
const ver = (formula: string, variables: Record<string, Valor> = {}) => formatear(evaluar(formula, { variables }))

describe('SI', () => {
  it.each([
    ['SI(VERDADERO; 1; 2)', '1'],
    ['SI(FALSO; 1; 2)', '2'],
    ['SI(0; 1; 2)', '2'],
    ['SI(-0,5; 1; 2)', '1'],
    ['SI("verdadero"; 1; 2)', '1'],
    ['SI("abc"; 1; 2)', '#¡VALOR!'],
    ['SI(1/0; 1; 2)', '#¡DIV/0!'],
    // Con dos argumentos y la condición falsa: FALSO. Un resultado omitido: 0.
    ['SI(FALSO; 1)', 'FALSO'],
    ['SI(VERDADERO;)', '0'],
    ['SI(FALSO; 1;)', '0'],
    ['SI(VERDADERO;;1)&"x"', '0x'],
    // Cortocircuito: la rama que no corresponde no se evalúa.
    ['SI(VERDADERO; 1; 1/0)', '1'],
    ['SI(FALSO; NOEXISTE(); "ok")', 'ok'],
    ['si(1>2; "mayor"; "menor")', 'menor'],
    ['IF(1<2; "en inglés")', 'en inglés'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('una variable vacía como condición es FALSO, y como resultado sigue vacía', () => {
    expect(ver('SI(V; 1; 2)', { V: VACIO })).toBe('2')
    expect(ver('SI(VERDADERO; V)&"x"', { V: VACIO })).toBe('x')
  })
})

describe('Y, O, NO', () => {
  it.each([
    ['Y(VERDADERO; 1; "VERDADERO")', 'VERDADERO'],
    ['Y(VERDADERO; 0)', 'FALSO'],
    ['O(FALSO; 0; 2)', 'VERDADERO'],
    ['O(FALSO; 0)', 'FALSO'],
    ['Y("abc")', '#¡VALOR!'],
    // Excel no hace cortocircuito en Y ni en O: los errores aparecen igual.
    ['Y(FALSO; 1/0)', '#¡DIV/0!'],
    ['O(VERDADERO; #N/D)', '#N/D'],
    ['NO(0)', 'VERDADERO'],
    ['NO(5)', 'FALSO'],
    ['NO("x")', '#¡VALOR!'],
    ['Y()', '#¡VALOR!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('de una variable ignoran el texto y el vacío; sin ningún lógico, #¡VALOR!', () => {
    const variables = { T: texto('abc'), V: VACIO, N: numero(1) }
    expect(ver('Y(T; V; N)', variables)).toBe('VERDADERO')
    expect(ver('O(T; V)', variables)).toBe('#¡VALOR!')
  })
})

describe('SI.ERROR, SI.CONJUNTO, CAMBIAR', () => {
  it.each([
    ['SI.ERROR(1/0; "sin dato")', 'sin dato'],
    ['SI.ERROR(5; 1/0)', '5'],
    ['SI.ERROR(#N/D; #¡NUM!)', '#¡NUM!'],
    ['SI.ERROR(1/0;)', '0'],
    ['SI.CONJUNTO(FALSO; 1; VERDADERO; 2; VERDADERO; 3)', '2'],
    ['SI.CONJUNTO(FALSO; 1)', '#N/D'],
    ['SI.CONJUNTO(VERDADERO; 1; 1/0; 2)', '1'],
    ['SI.CONJUNTO(1/0; 1)', '#¡DIV/0!'],
    ['SI.CONJUNTO(VERDADERO; 1; FALSO)', '#¡VALOR!'],
    ['CAMBIAR(2; 1; "uno"; 2; "dos")', 'dos'],
    ['CAMBIAR("B"; "a"; 1; "b"; 2)', '2'],
    ['CAMBIAR(3; 1; "uno"; "otro")', 'otro'],
    ['CAMBIAR(3; 1; "uno")', '#N/D'],
    // Sin convertir: el texto "1" no es el número 1.
    ['CAMBIAR("1"; 1; "número"; "texto")', 'texto'],
    ['CAMBIAR(1; 1; "uno"; 1/0; "nunca")', 'uno'],
    ['VERDADERO()', 'VERDADERO'],
    ['FALSO()', 'FALSO'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

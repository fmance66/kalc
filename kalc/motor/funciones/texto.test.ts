import { describe, expect, it } from 'vitest'
import { evaluar } from '../evaluador.ts'
import { fecha, formatear, type Valor } from '../valores.ts'

/** El resultado formateado, para escribir las tablas de casos más cortas. */
const ver = (formula: string, variables: Record<string, Valor> = {}) => formatear(evaluar(formula, { variables }))

describe('HALLAR y ENCONTRAR', () => {
  it.each([
    // HALLAR: sin distinguir mayúsculas, con comodines.
    ['HALLAR("pérez"; "Juan Pérez")', '6'],
    ['HALLAR("P"; "Juan Pérez")', '6'],
    ['HALLAR("a"; "banana"; 3)', '4'],
    ['HALLAR("j?an"; "Juan Pérez")', '1'],
    ['HALLAR("p*z"; "Juan Pérez")', '6'],
    ['HALLAR("~*"; "a*b")', '2'],
    ['HALLAR("x"; "Juan")', '#¡VALOR!'],
    ['HALLAR(""; "Juan"; 2)', '2'],
    ['HALLAR("a"; "Juan"; 0)', '#¡VALOR!'],
    ['HALLAR("a"; "Juan"; 5)', '#¡VALOR!'],
    ['HALLAR(1; 2013)', '3'],
    ['HALLAR("a"; 1/0)', '#¡DIV/0!'],
    ['SEARCH("an"; "Juan")', '3'],
    // ENCONTRAR: distingue mayúsculas, sin comodines.
    ['ENCONTRAR("P"; "Juan Pérez")', '6'],
    ['ENCONTRAR("p"; "Juan Pérez")', '#¡VALOR!'],
    ['ENCONTRAR("*"; "a*b")', '2'],
    ['ENCONTRAR("a"; "banana"; 3)', '4'],
    ['FIND("u"; "Juan")', '2'],
    // "Contiene": ESNUMERO de la posición.
    ['ESNUMERO(HALLAR("pérez"; "Juan Pérez"))', 'VERDADERO'],
    ['ESNUMERO(HALLAR("gómez"; "Juan Pérez"))', 'FALSO'],
    // CONTIENE (propia de Kalc): lo mismo, más fácil de leer.
    ['CONTIENE("Juan Pérez"; "pérez")', 'VERDADERO'],
    ['CONTIENE("Juan Pérez"; "gómez")', 'FALSO'],
    ['CONTIENE("Juan Pérez"; "j*z")', 'VERDADERO'],
    ['CONTIENE("a*b"; "~*")', 'VERDADERO'],
    ['CONTIENE("Juan"; "")', 'VERDADERO'],
    ['CONTIENE(""; "a")', 'FALSO'],
    ['CONTIENE(2013; 1)', 'VERDADERO'],
    ['CONTIENE(1/0; "a")', '#¡DIV/0!'],
    ['CONTIENE("a"; 1/0)', '#¡DIV/0!'],
  ])('%s → %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

describe('funciones de texto', () => {
  it.each([
    ['CONCAT("a"; 1,5; VERDADERO)', 'a1,5VERDADERO'],
    ['CONCATENAR("a"; "b")', 'ab'],
    ['CONCAT("a"; 1/0)', '#¡DIV/0!'],
    ['IZQUIERDA("20-12345678-9"; 2)', '20'],
    ['IZQUIERDA("abc")', 'a'],
    ['IZQUIERDA("abc"; 10)', 'abc'],
    ['IZQUIERDA("abc"; -1)', '#¡VALOR!'],
    ['DERECHA("abc"; 2)', 'bc'],
    ['DERECHA("abc"; 0)', ''],
    ['EXTRAE("20-12345678-9"; 4; 8)', '12345678'],
    ['EXTRAE("abc"; 5; 2)', ''],
    ['EXTRAE("abc"; 0; 2)', '#¡VALOR!'],
    ['LARGO("hola mundo")', '10'],
    ['LARGO(123,5)', '5'],
    ['MAYUSC("año fiscal")', 'AÑO FISCAL'],
    ['MINUSC("IVA")', 'iva'],
    ['ESPACIOS("  Juan    Pérez ")', 'Juan Pérez'],
    ['VALOR("1.234,5")', '1234,5'],
    ['VALOR("50%")', '0,5'],
    ['VALOR("31/12/2026")', '46387'],
    ['VALOR("abc")', '#¡VALOR!'],
    ['VALOR("")', '#¡VALOR!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

describe('TEXTO', () => {
  it.each([
    ['TEXTO(1234,5; "#.##0,00")', '1.234,50'],
    ['TEXTO(1234,5; "$ #.##0,00")', '$ 1.234,50'],
    ['TEXTO(-1234,5; "#.##0")', '-1.235'],
    ['TEXTO(0,256; "0,0%")', '25,6%'],
    ['TEXTO(7; "000")', '007'],
    ['TEXTO(0,5; "#,##")', ',5'],
    ['TEXTO(12; "0,##")', '12,'],
    ['TEXTO(1234567; "0.")', '1235'],
    ['TEXTO(1234567; "#.##0")', '1.234.567'],
    ['TEXTO(12345; "00-000")', '12-345'],
    ['TEXTO(-5; "0;(0)")', '(5)'],
    ['TEXTO(0; "0;-0;""cero""")', 'cero'],
    ['TEXTO(1,5; "General")', '1,5'],
    ['TEXTO(2,675; "0,00")', '2,68'],
    ['TEXTO("abc"; "0,00")', 'abc'],
    ['TEXTO("3"; "0,00")', '3,00'],
    ['TEXTO(46387; "dd/mm/aaaa")', '31/12/2026'],
    ['TEXTO(46387; "d ""de"" mmmm ""de"" yyyy")', '31 de diciembre de 2026'],
    ['TEXTO(46387; "dddd")', 'jueves'],
    ['TEXTO(46387; "ddd dd-mmm-aa")', 'jue 31-dic-26'],
    ['TEXTO(46387,75; "hh:mm")', '18:00'],
    ['TEXTO(-1; "dd/mm/aaaa")', '#¡VALOR!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('una fecha se formatea como su número', () => {
    expect(ver('TEXTO(F; "mm/aaaa")', { F: fecha(46387) })).toBe('12/2026')
  })
})

import { describe, expect, it } from 'vitest'
import { evaluar } from '../evaluador.ts'
import { fecha, formatear, logico, numero, texto, VACIO, type Valor } from '../valores.ts'

/** El resultado formateado, para escribir las tablas de casos más cortas. */
const ver = (formula: string, variables: Record<string, Valor> = {}) => formatear(evaluar(formula, { variables }))

describe('SUMA, PROMEDIO, MIN, MAX', () => {
  it.each([
    ['SUMA(1; 2; 3)', '6'],
    ['SUMA(1; "3"; VERDADERO)', '5'],
    ['SUMA(1; "abc")', '#¡VALOR!'],
    ['SUMA(1; #N/D; 1/0)', '#N/D'],
    ['SUMA(0,1; 0,2)', '0,3'],
    ['PROMEDIO(2; 4; 9)', '5'],
    ['PROMEDIO(1;)', '0,5'],
    ['MIN(5; -2; 8)', '-2'],
    ['MAX(5; -2; 8)', '8'],
    ['MAX("10"; 9)', '10'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('de una variable solo cuentan números y fechas, como en una celda', () => {
    const variables = { N: numero(10), T: texto('3'), L: logico(true), V: VACIO }
    expect(ver('SUMA(N; T; L; V)', variables)).toBe('10')
    expect(ver('PROMEDIO(N; T; L; V)', variables)).toBe('10')
    expect(ver('PROMEDIO(T; V)', variables)).toBe('#¡DIV/0!')
    expect(ver('MAX(T; L)', variables)).toBe('0')
    // Dentro de una expresión ya no es una variable sola: se convierte.
    expect(ver('SUMA(T+0; N)', variables)).toBe('13')
  })

  it('MIN y MAX de fechas dan una fecha', () => {
    const variables = { A: fecha(46387), B: fecha(46000) }
    expect(ver('MAX(A; B)', variables)).toBe('31/12/2026')
    expect(ver('SUMA(A; 1)', variables)).toBe('46388')
  })
})

describe('redondeos', () => {
  it.each([
    // La mitad se aleja del cero: ni el redondeo bancario ni el de Math.round.
    ['REDONDEAR(2,5; 0)', '3'],
    ['REDONDEAR(-2,5; 0)', '-3'],
    ['REDONDEAR(0,5; 0)', '1'],
    // A 15 dígitos: 2,675 es 2,67499999… en binario, pero Excel da 2,68.
    ['REDONDEAR(2,675; 2)', '2,68'],
    ['REDONDEAR(1,005; 2)', '1,01'],
    ['REDONDEAR(1234,567; -2)', '1200'],
    ['REDONDEAR(1,23; 1,9)', '1,2'],
    ['REDONDEAR(5; -400)', '0'],
    ['REDONDEAR("abc"; 1)', '#¡VALOR!'],
    ['REDONDEAR.MAS(3,141; 1)', '3,2'],
    ['REDONDEAR.MAS(-3,141; 1)', '-3,2'],
    ['REDONDEAR.MAS(0,1+0,2; 1)', '0,3'],
    ['REDONDEAR.MENOS(3,149; 1)', '3,1'],
    ['REDONDEAR.MENOS(-3,149; 1)', '-3,1'],
    ['TRUNCAR(-8,9)', '-8'],
    ['TRUNCAR(3,14159; 3)', '3,141'],
    ['ENTERO(8,9)', '8'],
    ['ENTERO(-8,9)', '-9'],
    ['ENTERO((0,1+0,7)*10)', '8'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

describe('ABS, RESIDUO, POTENCIA', () => {
  it.each([
    ['ABS(-12,5)', '12,5'],
    ['ABS("-3")', '3'],
    ['RESIDUO(7; 3)', '1'],
    // El signo es el del divisor.
    ['RESIDUO(-3; 2)', '1'],
    ['RESIDUO(3; -2)', '-1'],
    ['RESIDUO(5,5; 2)', '1,5'],
    ['RESIDUO(0,3; 0,1)', '0'],
    ['RESIDUO(1; 0)', '#¡DIV/0!'],
    ['POTENCIA(2; 10)', '1024'],
    ['POTENCIA(0; 0)', '#¡NUM!'],
    ['POTENCIA(-8; 1/3)', '#¡NUM!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

describe('RAIZ, logaritmos y EXP', () => {
  it.each([
    ['RAIZ(16)', '4'],
    ['RAIZ(2)', '1,4142135623731'],
    ['RAIZ(-1)', '#¡NUM!'],
    ['SQRT(9)', '3'],
    ['EXP(1)', '2,71828182845905'],
    ['EXP(0)', '1'],
    ['EXP(710)', '#¡NUM!'],
    ['LN(EXP(2))', '2'],
    ['LN(1)', '0'],
    ['LN(0)', '#¡NUM!'],
    ['LN(-1)', '#¡NUM!'],
    ['LOG10(1000)', '3'],
    ['LOG10(0,01)', '-2'],
    ['LOG(1000)', '3'],
    // Exacto: con Math.log(1000)/Math.log(10) ENTERO daría 2.
    ['ENTERO(LOG(1000))', '3'],
    ['LOG(8; 2)', '3'],
    ['LOG(81; 3)', '4'],
    ['LOG(10; 1)', '#¡DIV/0!'],
    ['LOG(10; 0)', '#¡NUM!'],
    ['LOG(0; 10)', '#¡NUM!'],
    ['LOG("abc")', '#¡VALOR!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

describe('trigonométricas', () => {
  it.each([
    ['PI()', '3,14159265358979'],
    ['RADIANES(180)', '3,14159265358979'],
    ['GRADOS(PI())', '180'],
    ['SENO(RADIANES(30))', '0,5'],
    ['SIN(0)', '0'],
    // Como Excel: no da 0, da el error binario de π.
    ['SENO(PI())', '1,22464679914735E-16'],
    ['COS(PI())', '-1'],
    ['TAN(RADIANES(45))', '1'],
    ['SENO(2^27)', '#¡NUM!'],
    ['COS(-(2^27))', '#¡NUM!'],
    ['GRADOS(ASENO(0,5))', '30'],
    ['ASENO(2)', '#¡NUM!'],
    ['ACOS(-1)', '3,14159265358979'],
    ['ACOS(1,1)', '#¡NUM!'],
    ['GRADOS(ATAN(1))', '45'],
    // ATAN2 recibe primero x y después y.
    ['GRADOS(ATAN2(-1; 1))', '135'],
    ['GRADOS(ATAN2(1; -1))', '-45'],
    ['ATAN2(0; 0)', '#¡DIV/0!'],
    ['SENOH(0)', '0'],
    ['COSH(0)', '1'],
    ['TANH(0)', '0'],
    ['COSH(1000)', '#¡NUM!'],
    ['ASENOH(SENOH(1))', '1'],
    ['ACOSH(1)', '0'],
    ['ACOSH(0,5)', '#¡NUM!'],
    ['ATANH(0,5)', '0,549306144334055'],
    ['ATANH(1)', '#¡NUM!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { evaluar } from './evaluador.ts'
import { registrarFuncion } from './funciones/registro.ts'
import { ErrorSintaxis } from './lexer.ts'
import { formatear, numero, texto, VACIO, type Valor } from './valores.ts'

/** El resultado formateado, para escribir las tablas de casos más cortas. */
const ver = (formula: string, variables: Record<string, Valor> = {}) => formatear(evaluar(formula, { variables }))

describe('aritmética', () => {
  it.each([
    ['1+2*3', '7'],
    ['10/4', '2,5'],
    ['2^10', '1024'],
    ['-3--3', '0'],
    ['200%%', '0,02'],
    ['"1.000"*2', '2000'],
    ['1/3', '0,333333333333333'],
    ['0^0', '#¡NUM!'],
    ['0^-1', '#¡DIV/0!'],
    ['(-8)^(1/3)', '#¡NUM!'],
    ['1E+308*10', '#¡NUM!'],
    ['""+1', '#¡VALOR!'],
    ['+"abc"', 'abc'],
    ['-"abc"', '#¡VALOR!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

describe('errores', () => {
  it.each([
    ['#N/D+1', '#N/D'],
    ['1/0+#N/D', '#¡DIV/0!'],
    ['#N/D&(1/0)', '#N/D'],
    ['1/0=1/0', '#¡DIV/0!'],
    ['-#¡NUM!', '#¡NUM!'],
    ['X+1', '#¿NOMBRE?'],
    ['NOEXISTE(1)', '#¿NOMBRE?'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('un error de sintaxis lanza ErrorSintaxis con la posición', () => {
    expect(() => evaluar('1+')).toThrow(ErrorSintaxis)
  })
})

describe('comparaciones', () => {
  it.each([
    ['"abc"<"ABD"', 'VERDADERO'],
    ['"á"="a"', 'FALSO'],
    ['1<"0"', 'VERDADERO'],
    ['"a"<VERDADERO', 'VERDADERO'],
    ['FALSO<VERDADERO', 'VERDADERO'],
    ['2>=2', 'VERDADERO'],
    ['1<>1', 'FALSO'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('vacío se compara como 0, "" o FALSO según el otro lado', () => {
    const variables = { V: VACIO }
    expect(ver('V=0', variables)).toBe('VERDADERO')
    expect(ver('V=""', variables)).toBe('VERDADERO')
    expect(ver('V=FALSO', variables)).toBe('VERDADERO')
    expect(ver('V=V', variables)).toBe('VERDADERO')
  })
})

describe('variables', () => {
  it('se buscan sin distinguir mayúsculas, también entre corchetes', () => {
    expect(ver('alicuota*[Base imponible]', { Alicuota: numero(0.21), 'base imponible': numero(1000) })).toBe('210')
  })

  it('una variable vacía vale 0 en aritmética y "" en texto', () => {
    expect(ver('V+1', { V: VACIO })).toBe('1')
    expect(ver('"x"&V&"x"', { V: VACIO })).toBe('xx')
  })

  it('una fórmula nunca da vacío: =V con V vacía da 0', () => {
    expect(evaluar('V', { variables: { V: VACIO } })).toEqual(numero(0))
  })

  it('acepta una función para buscarlas', () => {
    expect(formatear(evaluar('N&"!"', { variables: () => texto('hola') }))).toBe('hola!')
  })
})

describe('fechas', () => {
  const variables = { F: { tipo: 'fecha', valor: 46387 } as Valor } // 31/12/2026

  it.each([
    ['F+1', '01/01/2027'],
    ['1+F', '01/01/2027'],
    ['F-31', '30/11/2026'],
    ['F-"1/1/2026"', '364'],
    ['F*1', '46387'],
    ['F&""', '46387'],
    // Un texto no se convierte al comparar: siempre es mayor que un número o una fecha.
    ['F>"30/12/2026"', 'FALSO'],
    ['F>46386', 'VERDADERO'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula, variables)).toBe(esperado)
  })
})

describe('llamadas a funciones', () => {
  afterEach(() => registrarFuncion({ nombre: 'PRUEBA', minimo: 0, maximo: 0, evaluar: () => VACIO }))

  it('los argumentos llegan sin evaluar: la función decide (cortocircuito)', () => {
    let evaluados = 0
    registrarFuncion({
      nombre: 'PRUEBA',
      alias: ['TEST'],
      minimo: 2,
      maximo: 2,
      evaluar: ([a]) => {
        evaluados++
        return a?.() ?? VACIO
      },
    })
    expect(ver('PRUEBA(7;1/0)')).toBe('7')
    expect(ver('test(7;1/0)')).toBe('7')
    expect(evaluados).toBe(2)
    expect(ver('PRUEBA(1)')).toBe('#¡VALOR!')
    expect(ver('PRUEBA(1;2;3)')).toBe('#¡VALOR!')
  })
})

import { describe, expect, it } from 'vitest'
import { fechaASerie, serieAFecha } from './calendario.ts'
import { aNumero, aTexto, formatear, numeroATexto, textoANumero, type Valor } from './valores.ts'

describe('textoANumero', () => {
  it.each([
    ['3', 3],
    [' 3 ', 3],
    ['-3', -3],
    ['1,5', 1.5],
    [',5', 0.5],
    ['1.234,5', 1234.5],
    ['1234', 1234],
    ['50%', 0.5],
    ['1,5E+3', 1500],
    ['$ 100', 100],
    ['31/12/2026', 46387],
    ['1/1/1900', 1],
  ] as const)('"%s" → %s', (s, n) => {
    expect(textoANumero(s)).toBe(n)
  })

  it.each(['', 'abc', '1.5', '12.34', 'VERDADERO', '$', '31/02/2026', '1,2,3'])('"%s" no es un número', (s) => {
    expect(textoANumero(s)).toBeNull()
  })
})

describe('numeroATexto (formato General)', () => {
  it.each([
    [0, '0'],
    [-0, '0'],
    [1.5, '1,5'],
    [-1234.5, '-1234,5'],
    [1 / 3, '0,333333333333333'],
    [0.1 + 0.2, '0,3'],
    [1e14, '100000000000000'],
    [1e15, '1E+15'],
    [1.5e20, '1,5E+20'],
    [1e-7, '0,0000001'],
    [1e-10, '1E-10'],
  ])('%s → %s', (n, s) => {
    expect(numeroATexto(n)).toBe(s)
  })
})

describe('coerciones', () => {
  it.each<[Valor, number | string]>([
    [{ tipo: 'logico', valor: true }, 1],
    [{ tipo: 'vacio' }, 0],
    [{ tipo: 'fecha', valor: 45000 }, 45000],
    [{ tipo: 'texto', valor: '' }, '#¡VALOR!'],
    [{ tipo: 'error', valor: '#N/D' }, '#N/D'],
  ])('aNumero(%o)', (v, esperado) => {
    const r = aNumero(v)
    expect(typeof r === 'number' ? r : r.valor).toBe(esperado)
  })

  it.each<[Valor, string]>([
    [{ tipo: 'logico', valor: false }, 'FALSO'],
    [{ tipo: 'vacio' }, ''],
    [{ tipo: 'fecha', valor: 45000 }, '45000'],
  ])('aTexto(%o) = %s', (v, esperado) => {
    expect(aTexto(v)).toBe(esperado)
  })
})

describe('formatear', () => {
  it.each<[Valor, string]>([
    [{ tipo: 'numero', valor: 1234.56 }, '1234,56'],
    [{ tipo: 'numero', valor: -0 }, '0'],
    [{ tipo: 'numero', valor: 1e20 }, '1E+20'],
    [{ tipo: 'fecha', valor: 46387 }, '31/12/2026'],
    [{ tipo: 'fecha', valor: -1 }, '######'],
    [{ tipo: 'logico', valor: true }, 'VERDADERO'],
    [{ tipo: 'error', valor: '#¡DIV/0!' }, '#¡DIV/0!'],
  ])('%o → %s', (v, s) => {
    expect(formatear(v)).toBe(s)
  })
})

describe('calendario', () => {
  it.each([
    [1, 1900, 1, 1],
    [59, 1900, 2, 28],
    [60, 1900, 2, 29],
    [61, 1900, 3, 1],
    [45658, 2025, 1, 1],
    [2958465, 9999, 12, 31],
  ])('serie %i = %i-%i-%i, en las dos direcciones', (serie, anio, mes, dia) => {
    expect(serieAFecha(serie)).toEqual({ anio, mes, dia })
    expect(fechaASerie({ anio, mes, dia })).toBe(serie)
  })

  it('rechaza fechas inexistentes o fuera de rango', () => {
    expect(fechaASerie({ anio: 2026, mes: 2, dia: 29 })).toBeNull()
    expect(fechaASerie({ anio: 1899, mes: 12, dia: 31 })).toBeNull()
    expect(fechaASerie({ anio: 10000, mes: 1, dia: 1 })).toBeNull()
    expect(serieAFecha(0)).toBeNull()
  })
})

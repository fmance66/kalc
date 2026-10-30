/**
 * Arrays dinámicos (como Excel 365), funciones que devuelven tablas, `[@Columna]` y tablas escritas a
 * mano. Resultados esperados según el comportamiento documentado de Excel 365 (es-AR).
 */

import { describe, expect, it } from 'vitest'
import { dependencias } from './ast.ts'
import { evaluar, evaluarComoTabla, type Contexto } from './evaluador.ts'
import { CONTEXTO_EJEMPLOS } from './funciones/ejemplos.ts'
import { parsear } from './parser.ts'
import { escribirDatos, leerDatos, type Tabla } from './tablas.ts'
import { fecha, fechaASerie, formatear, logico, numero, texto, VACIO, type Valor } from './index.ts'

const columna = (...valores: Valor[]): Tabla => ({ columnas: ['A'], filas: valores.map((v) => [v]) })

/**
 * Causas (de los ejemplos): Pérez/Federal/320000/40, Gómez/Federal/850000/12,
 * López/Penal Económico/150000/60, Díaz/Penal Económico/980000/8, Ruiz/Criminal/210000/(vacío),
 * Sosa/Criminal/450000/25.
 */
const TABLAS: Record<string, Tabla> = {
  ...CONTEXTO_EJEMPLOS.tablas,
  Escala: { columnas: ['Desde', 'Alicuota'], filas: [[numero(0), numero(0.05)], [numero(1000), numero(0.1)], [numero(5000), numero(0.2)]] },
  Desc: columna(numero(30), numero(20), numero(10)),
  Una: columna(numero(7)),
  Letras: columna(texto('a'), texto('A'), texto('b'), texto('c'), texto('c')),
  Fechas: columna(fecha(46387), fecha(46022)),
}

const contexto: Contexto = { tablas: TABLAS }
const ver = (formula: string, c: Contexto = contexto) => formatear(evaluar(formula, c))

/** La fórmula como tabla: columnas y celdas formateadas, o el valor si da uno solo. */
function comoTabla(formula: string): { columnas: string[]; filas: string[][] } | string {
  const r = parsear(formula)
  if (!r.ok) throw new Error(r.error.mensaje)
  const t = evaluarComoTabla(r.arbol, contexto)
  return 'columnas' in t ? { columnas: t.columnas, filas: t.filas.map((f) => f.map(formatear)) } : formatear(t)
}

describe('arrays dinámicos: funciones de un valor con un rango, celda por celda', () => {
  it.each([
    // "Contiene", la condición que más se pide: los nombres con "ez" son Pérez, Gómez y López.
    ['SUMA(ESNUMERO(HALLAR("ez"; Causas[Causa])) * 1)', '3'],
    ['CONTAR.SI(ESNUMERO(HALLAR("ez"; Causas[Causa])); VERDADERO)', '3'],
    ['FILAS(FILTRAR(Causas; ESNUMERO(HALLAR("ez"; Causas[Causa]))))', '3'],
    // CONTIENE, propia de Kalc: lo mismo que ESNUMERO(HALLAR(…)).
    ['FILAS(FILTRAR(Causas; CONTIENE(Causas[Causa]; "ez")))', '3'],
    ['CONTAR.SI(CONTIENE(Causas[Fuero]; "penal"); VERDADERO)', '2'],
    ['CONTAR.SI(LARGO(Causas[Causa]); 4)', '3'],
    // Dos rangos del mismo tamaño: cada letra se encuentra a sí misma en la posición 1.
    ['SUMA(HALLAR(Letras[A]; Letras[A]))', '5'],
    ['SUMA(AÑO(Fechas[A]))', '4051'],
    // Como valor suelto: una celda, o #¡VALOR!.
    ['LARGO(Una[A])', '1'],
    ['LARGO(Causas[Causa])', '#¡VALOR!'],
    // Sin rangos, como siempre.
    ['ESNUMERO(1)', 'VERDADERO'],
    ['MAYUSC("abc")', 'ABC'],
  ])('%s → %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('FILTRAR con "contiene" devuelve las filas', () => {
    const t = comoTabla('FILTRAR(Causas; ESNUMERO(HALLAR("ez"; Causas[Causa])))')
    expect(typeof t === 'string' ? t : t.filas.map((f) => f[0])).toEqual(['Pérez', 'Gómez', 'López'])
  })

  it('el resultado es un rango del tamaño de la columna', () => {
    const t = comoTabla('MAYUSC(Causas[Fuero])')
    expect(typeof t === 'string' ? t : t.filas.map((f) => f[0])).toEqual(['FEDERAL', 'FEDERAL', 'PENAL ECONÓMICO', 'PENAL ECONÓMICO', 'CRIMINAL', 'CRIMINAL'])
  })

  it('un error en un argumento que no es rango se repite en todas las celdas', () => {
    const t = comoTabla('HALLAR(1/0; Causas[Causa])')
    expect(typeof t === 'string' ? t : t.filas.map((f) => f[0])).toEqual(Array(6).fill('#¡DIV/0!'))
  })

  it('CONCAT no va celda por celda: lee el rango entero', () => {
    expect(ver('CONCAT(Letras[A])')).not.toBe('a')
  })
})

describe('arrays dinámicos: operaciones celda por celda', () => {
  it.each([
    ['SUMA(Causas[Monto] * 2)', '5920000'],
    ['SUMA(Causas[Monto]%)', '29600'],
    ['SUMA(-Causas[Fojas])', '-145'],
    // Contar y sumar con condición, sin CONTAR.SI: VERDADERO * 1 es 1.
    ['SUMA((Causas[Fuero] = "Federal") * 1)', '2'],
    ['SUMA((Causas[Fuero] = "Federal") * Causas[Monto])', '1170000'],
    // Los lógicos de un rango no se suman, como en Excel.
    ['SUMA(Causas[Fuero] = "Federal")', '0'],
    ['CONTAR.SI(Causas[Monto] / 1000; ">500")', '2'],
    ['FILAS(Causas[Monto] * 2)', '6'],
    // Una tabla de varias columnas por un valor.
    ['SUMA(Escala * 2)', '12000,7'],
    // Dos columnas del mismo largo, celda por celda.
    ['SUMA(Desc[A] + Escala[Desde])', '6060'],
    // De distinto largo: lo que sobra da #N/D (y CONTAR no cuenta errores).
    ['CONTAR(Desc[A] + Causas[Monto])', '3'],
    // Como valor suelto: #¡VALOR!, salvo una sola celda.
    ['Causas[Monto] * 2', '#¡VALOR!'],
    ['Una * 2', '14'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('evaluarComoTabla devuelve la tabla, o el valor si la fórmula da uno solo', () => {
    expect(comoTabla('Causas[Monto] / 1000')).toEqual({ columnas: ['Columna1'], filas: [['320'], ['850'], ['150'], ['980'], ['210'], ['450']] })
    expect(comoTabla('SUMA(Causas[Monto])')).toBe('2960000')
    expect(comoTabla('Causas[Nada] * 2')).toBe('#¡REF!')
  })
})

describe('funciones que devuelven tablas', () => {
  it.each([
    ['FILAS(FILTRAR(Causas; Causas[Fuero] = "Federal"))', '2'],
    ['INDICE(FILTRAR(Causas; Causas[Monto] > 500000); 1; 1)', 'Gómez'],
    ['FILAS(FILTRAR(Causas; Causas[Monto]))', '6'],
    ['FILTRAR(Causas; Causas[Fuero] = "Nada")', '#N/D'],
    ['FILTRAR(Causas; Causas[Fuero] = "Nada"; "Ninguna")', 'Ninguna'],
    ['FILTRAR(Causas; Escala[Desde] > 0)', '#¡VALOR!'],

    ['INDICE(ORDENAR(Causas; 3; -1); 1; 1)', 'Díaz'],
    ['INDICE(ORDENAR(Causas; 3); 1; 1)', 'López'],
    ['INDICE(ORDENAR(Causas[Causa]); 1)', 'Díaz'],
    // Las vacías van al final, en los dos órdenes.
    ['INDICE(ORDENAR(Causas; 4); 6; 1)', 'Ruiz'],
    ['INDICE(ORDENAR(Causas; 4; -1); 6; 1)', 'Ruiz'],
    ['INDICE(ORDENAR(Causas; 4; -1); 1; 1)', 'López'],
    ['ORDENAR(Causas; 5)', '#¡VALOR!'],
    ['ORDENAR(Causas; 1; 2)', '#¡VALOR!'],

    ['FILAS(UNICOS(Causas[Fuero]))', '3'],
    ['INDICE(UNICOS(Causas[Fuero]); 3)', 'Criminal'],
    // Sin distinguir mayúsculas: "a" y "A" son la misma.
    ['FILAS(UNICOS(Letras[A]))', '3'],
    ['INDICE(UNICOS(Letras[A]; FALSO; VERDADERO); 1)', 'b'],
    ['UNICOS(Letras[A]; VERDADERO)', '#¡VALOR!'],

    ['COLUMNAS(ELEGIRCOLS(Causas; 1; 3))', '2'],
    ['INDICE(ELEGIRCOLS(Causas; -1); 1)', '40'],
    ['ELEGIRCOLS(Causas; 0)', '#¡VALOR!'],
    ['ELEGIRCOLS(Causas; 5)', '#¡VALOR!'],

    ['INDICE(TOMAR(ORDENAR(Causas; 3; -1); 2); 2; 1)', 'Gómez'],
    ['FILAS(TOMAR(Causas; -2))', '2'],
    ['INDICE(TOMAR(Causas; -1); 1; 1)', 'Sosa'],
    ['COLUMNAS(TOMAR(Causas; 2; 2))', '2'],
    ['TOMAR(Causas; 0)', '#N/D'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })

  it('conservan los nombres de las columnas', () => {
    expect(comoTabla('FILTRAR(Causas; Causas[Fuero] = "Criminal")')).toEqual({
      columnas: ['Causa', 'Fuero', 'Monto', 'Fojas'],
      filas: [
        ['Ruiz', 'Criminal', '210000', ''],
        ['Sosa', 'Criminal', '450000', '25'],
      ],
    })
    expect(comoTabla('ELEGIRCOLS(TOMAR(Causas; 1); 3; 1)')).toEqual({ columnas: ['Monto', 'Causa'], filas: [['320000', 'Pérez']] })
    expect(comoTabla('UNICOS(Causas[Fuero])')).toEqual({ columnas: ['Fuero'], filas: [['Federal'], ['Penal Económico'], ['Criminal']] })
  })
})

describe('[@Columna]: la celda de la fila que se calcula', () => {
  it('se escribe como en Excel', () => {
    expect(parsear('[@Alta]')).toEqual({ ok: true, arbol: { clase: 'referencia', nombre: '', columna: 'Alta', filaActual: true, inicio: 0, fin: 7 } })
    expect(parsear('Causas[@Monto]')).toMatchObject({ ok: true, arbol: { nombre: 'Causas', columna: 'Monto', filaActual: true } })
    expect(parsear('[@[Monto total]] * 2')).toMatchObject({ ok: true, arbol: { izquierda: { columna: 'Monto total', filaActual: true } } })
    const vacia = parsear('[@]')
    expect(vacia.ok ? null : vacia.error.mensaje).toBe('Falta el nombre de la columna')
  })

  it('no es una dependencia', () => {
    const r = parsear('[@Alta] + Causas[@Monto] + X')
    expect(r.ok && dependencias(r.arbol)).toEqual(['X'])
  })

  it('lee la fila del contexto; sin fila, #¡VALOR!', () => {
    const fila: Contexto = { fila: (c) => (c.toLowerCase() === 'monto' ? numero(10) : undefined) }
    expect(ver('[@Monto] * 2', fila)).toBe('20')
    expect(ver('[@monto] + 1', fila)).toBe('11')
    expect(ver('[@Nada]', fila)).toBe('#¡REF!')
    expect(ver('[@Monto] * 2', {})).toBe('#¡VALOR!')
  })
})

describe('tablas escritas a mano', () => {
  it('lee la primera línea como columnas y cada celda como una constante', () => {
    expect(leerDatos('Tipo;Alicuota\nGeneral;0,21\nReducida; 10,5%\nExento;\n')).toEqual({
      ok: true,
      tabla: {
        columnas: ['Tipo', 'Alicuota'],
        filas: [
          [texto('General'), numero(0.21)],
          [texto('Reducida'), numero(0.105)],
          [texto('Exento'), VACIO],
        ],
      },
    })
    // Pegada desde Excel: con tabulaciones.
    expect(leerDatos('A\tB\tC\n1.234,5\t31/12/2026\tVERDADERO')).toEqual({
      ok: true,
      tabla: { columnas: ['A', 'B', 'C'], filas: [[numero(1234.5), fecha(fechaASerie({ dia: 31, mes: 12, anio: 2026 }) as number), logico(true)]] },
    })
    // Entre comillas es un texto, aunque parezca un número o tenga el separador.
    expect(leerDatos('"A;B";C\n"100";"dijo ""hola"""')).toEqual({ ok: true, tabla: { columnas: ['A;B', 'C'], filas: [[texto('100'), texto('dijo "hola"')]] } })
  })

  it.each([
    ['', 'Falta la primera línea, con los nombres de las columnas'],
    ['A;;B', 'Falta el nombre de la columna 2'],
    ['A;a', 'Hay dos columnas que se llaman a'],
    ['A;B\n1;2;3', 'La fila 1 tiene 3 valores y hay 2 columnas'],
  ])('%j → %s', (escrito, mensaje) => {
    expect(leerDatos(escrito)).toEqual({ ok: false, mensaje })
  })

  it('escribirDatos se vuelve a leer igual', () => {
    const tabla: Tabla = {
      columnas: ['Texto', 'Número', 'Fecha', 'Lógico'],
      filas: [
        [texto('100'), numero(1234.5), fecha(46387), logico(false)],
        [texto('a;b'), VACIO, VACIO, logico(true)],
      ],
    }
    expect(escribirDatos(tabla)).toBe('Texto;Número;Fecha;Lógico\n"100";1234,5;31/12/2026;FALSO\n"a;b";;;VERDADERO')
    expect(leerDatos(escribirDatos(tabla))).toEqual({ ok: true, tabla })
  })
})

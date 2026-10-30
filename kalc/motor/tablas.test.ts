/**
 * Tablas (`Causas[Monto]`) y las funciones que las leen. Resultados esperados según el
 * comportamiento documentado de Excel 365 (es-AR).
 */

import { describe, expect, it } from 'vitest'
import { dependencias } from './ast.ts'
import { evaluar } from './evaluador.ts'
import { CONTEXTO_EJEMPLOS } from './funciones/ejemplos.ts'
import { parsear } from './parser.ts'
import type { Tabla } from './tablas.ts'
import { error, formatear, logico, numero, texto, VACIO, type Valor } from './valores.ts'

const columna = (...valores: Valor[]): Tabla => ({ columnas: ['A'], filas: valores.map((v) => [v]) })

/**
 * Causas (de los ejemplos): Pérez/Federal/320000/40, Gómez/Federal/850000/12,
 * López/Penal Económico/150000/60, Díaz/Penal Económico/980000/8, Ruiz/Criminal/210000/(vacío),
 * Sosa/Criminal/450000/25.
 */
const TABLAS: Record<string, Tabla> = {
  ...CONTEXTO_EJEMPLOS.tablas,
  Mezcla: columna(numero(100), texto('100'), texto('abc'), logico(true), VACIO, error('#N/D')),
  Escala: { columnas: ['Desde', 'Alicuota'], filas: [[numero(0), numero(0.05)], [numero(1000), numero(0.1)], [numero(5000), numero(0.2)]] },
  Desc: columna(numero(30), numero(20), numero(10)),
  Una: columna(numero(7)),
  'Mis ventas': { columnas: ['Monto total'], filas: [[numero(10)], [numero(5)]] },
}
const VARIABLES: Record<string, Valor> = { X: numero(1), Pendiente: error('#N/D') }

const ver = (formula: string) => formatear(evaluar(formula, { variables: VARIABLES, tablas: TABLAS }))

describe('sintaxis de tablas', () => {
  it('el corchete pegado al nombre es una columna', () => {
    expect(parsear('Causas[Monto]')).toEqual({ ok: true, arbol: { clase: 'referencia', nombre: 'Causas', columna: 'Monto', inicio: 0, fin: 13 } })
    const r = parsear('[Mis ventas][ Monto total ]')
    expect(r.ok && r.arbol).toMatchObject({ clase: 'referencia', nombre: 'Mis ventas', columna: 'Monto total' })
  })

  it.each([
    ['Causas [Monto]', 'Falta un operador antes de esto'],
    ['Causas[Monto', 'Falta cerrar el corchete de la columna'],
    ['Causas[]', 'Falta el nombre de la columna'],
  ])('%s → %s', (formula, mensaje) => {
    const r = parsear(formula)
    expect(r.ok ? null : r.error.mensaje).toBe(mensaje)
  })

  it('la dependencia es la tabla', () => {
    const r = parsear('SUMA(Causas[Monto]) + Causas[Fojas] + X')
    expect(r.ok && dependencias(r.arbol)).toEqual(['Causas', 'X'])
  })
})

describe('tablas como valor', () => {
  it.each([
    // Sin arrays: un rango de varias celdas como valor suelto da #¡VALOR!; de una, su valor.
    ['Causas[Monto]', '#¡VALOR!'],
    ['Causas[Monto] * 2', '#¡VALOR!'],
    ['Causas', '#¡VALOR!'],
    ['Una + 1', '8'],
    ['Una[a] * 2', '14'],
    // Una columna que no existe, o de algo que no es una tabla.
    ['Causas[Nada]', '#¡REF!'],
    ['SUMA(Causas[Nada])', '#¡REF!'],
    ['Nada[Precio]', '#¿NOMBRE?'],
    ['X[Precio]', '#¡REF!'],
    // Una consulta pendiente: su error.
    ['SUMA(Pendiente[Precio])', '#N/D'],
    ['SUMA([Mis ventas][Monto total])', '15'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

describe('funciones de siempre con tablas', () => {
  it.each([
    ['SUMA(Causas[Monto])', '2960000'],
    // De la tabla entera solo cuentan los números: montos y fojas.
    ['SUMA(Causas)', '2960145'],
    ['SUMA(Causas[Monto]; 40000)', '3000000'],
    ['PROMEDIO(Causas[Fojas])', '29'],
    ['MIN(Causas[Monto])', '150000'],
    ['MAX(Causas[Monto])', '980000'],
    ['SUMA(Mezcla[A])', '#N/D'],
    ['Y(Causas[Monto])', 'VERDADERO'],
    ['O(Causas[Causa])', '#¡VALOR!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

describe('conteos y condiciones', () => {
  it.each([
    ['CONTAR(Causas[Fojas])', '5'],
    ['CONTAR(Causas)', '11'],
    ['CONTAR(Mezcla[A])', '1'],
    // Escrito directo se convierte; los errores no se cuentan.
    ['CONTAR("3"; "abc"; VERDADERO; #N/D)', '2'],
    ['CONTARA(Causas[Fojas])', '5'],
    ['CONTARA(Causas)', '23'],
    ['CONTARA(Mezcla[A])', '5'],
    ['CONTARA(1; ""; #N/D)', '3'],
    ['CONTAR.BLANCO(Causas[Fojas])', '1'],

    ['CONTAR.SI(Causas[Fuero]; "Penal Económico")', '2'],
    ['CONTAR.SI(Causas[Fuero]; "penal económico")', '2'],
    ['CONTAR.SI(Causas[Fuero]; "P*")', '2'],
    // Los acentos sí se distinguen: "Lopez" no es "López"; ? es cualquier letra, también una con acento.
    ['CONTAR.SI(Causas[Causa]; "Lopez")', '0'],
    ['CONTAR.SI(Causas[Causa]; "G?mez")', '1'],
    ['CONTAR.SI(Causas[Causa]; "*z")', '5'],
    ['CONTAR.SI(Causas[Fuero]; ">M")', '2'],
    ['CONTAR.SI(Causas[Monto]; ">500000")', '2'],
    ['CONTAR.SI(Causas[Monto]; "<=210000")', '2'],
    ['CONTAR.SI(Causas[Monto]; "<>320000")', '5'],
    ['CONTAR.SI(Causas[Monto]; 320000)', '1'],
    ['CONTAR.SI(Causas[Monto]; "320000")', '1'],
    ['CONTAR.SI(Causas[Fojas]; "")', '1'],
    ['CONTAR.SI(Causas[Fojas]; "<>")', '5'],
    // <> cuenta también las vacías.
    ['CONTAR.SI(Causas[Fojas]; "<>40")', '5'],
    // Un número encuentra también el texto que lo es; con > solo los números.
    ['CONTAR.SI(Mezcla[A]; 100)', '2'],
    ['CONTAR.SI(Mezcla[A]; ">50")', '1'],
    ['CONTAR.SI(Mezcla[A]; VERDADERO)', '1'],
    ['CONTAR.SI(Mezcla[A]; "#N/D")', '1'],
    ['CONTAR.SI(Mezcla[A]; "<>abc")', '5'],

    ['CONTAR.SI.CONJUNTO(Causas[Fuero]; "Federal"; Causas[Monto]; ">500000")', '1'],
    // Rangos de distinto tamaño.
    ['CONTAR.SI.CONJUNTO(Causas[Fuero]; "a"; Causas; 1)', '#¡VALOR!'],
    ['CONTAR.SI.CONJUNTO(Causas[Fuero]; "a"; Causas[Monto])', '#¡VALOR!'],

    ['SUMAR.SI(Causas[Fuero]; "Criminal"; Causas[Monto])', '660000'],
    ['SUMAR.SI(Causas[Monto]; ">500000")', '1830000'],
    ['SUMAR.SI(Causas[Fuero]; "Criminal"; Causas[Fojas])', '25'],
    ['SUMAR.SI.CONJUNTO(Causas[Fojas]; Causas[Monto]; "<500000"; Causas[Fuero]; "<>Penal Económico")', '65'],
    ['PROMEDIO.SI(Causas[Fuero]; "P*"; Causas[Monto])', '565000'],
    ['PROMEDIO.SI(Causas[Fuero]; "Nada"; Causas[Monto])', '#¡DIV/0!'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

describe('búsqueda', () => {
  it.each([
    ['BUSCARV("Gómez"; Causas; 3; FALSO)', '850000'],
    ['BUSCARV("gómez"; Causas; 3; FALSO)', '850000'],
    ['BUSCARV("D*"; Causas; 2; FALSO)', 'Penal Económico'],
    ['BUSCARV("Nadie"; Causas; 3; FALSO)', '#N/D'],
    ['BUSCARV("Gómez"; Causas; 5; FALSO)', '#¡REF!'],
    ['BUSCARV("Gómez"; Causas; 0; FALSO)', '#¡VALOR!'],
    // Una celda vacía da 0, como en Excel.
    ['BUSCARV("Ruiz"; Causas; 4; FALSO)', '0'],
    // Aproximada (si falta el cuarto argumento): el mayor que no se pase.
    ['BUSCARV(2500; Escala; 2)', '0,1'],
    ['BUSCARV(5000; Escala; 2; VERDADERO)', '0,2'],
    ['BUSCARV(-1; Escala; 2)', '#N/D'],
    // Omitido con ; es FALSO.
    ['BUSCARV(2500; Escala; 2;)', '#N/D'],
    ['BUSCARV(1/0; Escala; 2)', '#¡DIV/0!'],

    ['COINCIDIR("Ruiz"; Causas[Causa]; 0)', '5'],
    ['COINCIDIR(2500; Escala[Desde])', '2'],
    ['COINCIDIR(15; Desc[A]; -1)', '2'],
    ['COINCIDIR("Ruiz"; Causas; 0)', '#N/D'],

    ['INDICE(Causas; 4; 1)', 'Díaz'],
    ['INDICE(Causas[Monto]; 2)', '850000'],
    ['INDICE(Causas[Monto]; 2; 0)', '850000'],
    ['INDICE(Causas; 7; 1)', '#¡REF!'],
    ['INDICE(Causas; 2)', '#¡VALOR!'],
    ['INDICE(Causas; 2; 0)', '#¡VALOR!'],
    ['INDICE(Causas[Monto]; COINCIDIR("Díaz"; Causas[Causa]; 0))', '980000'],

    ['BUSCARX("López"; Causas[Causa]; Causas[Fojas]; "No está")', '60'],
    ['BUSCARX("Nadie"; Causas[Causa]; Causas[Fojas]; "No está")', 'No está'],
    ['BUSCARX("Nadie"; Causas[Causa]; Causas[Fojas])', '#N/D'],
    // si_no_está solo se evalúa si hace falta.
    ['BUSCARX("López"; Causas[Causa]; Causas[Fojas]; 1/0)', '60'],
    ['BUSCARX("López"; Causas[Causa]; Causas)', '#¡VALOR!'],
    ['BUSCARX("López"; Causas[Causa]; Escala[Desde])', '#¡VALOR!'],

    ['FILAS(Causas)', '6'],
    ['COLUMNAS(Causas)', '4'],
    ['COLUMNAS(Causas[Monto])', '1'],
  ])('%s = %s', (formula, esperado) => {
    expect(ver(formula)).toBe(esperado)
  })
})

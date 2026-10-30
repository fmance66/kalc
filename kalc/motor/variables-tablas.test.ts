import { describe, expect, it } from 'vitest'
import type { EjecutorConsultas } from './consultas.ts'
import { leerDatos, type Tabla } from './tablas.ts'
import { formatear, numero, texto, type Valor } from './valores.ts'
import { crearCatalogo, esVariable, type ColumnaCalculada, type TipoVariable, type Variable } from './variables.ts'

const constante = (nombre: string, valor: Valor, tipo: TipoVariable = 'numero'): Variable => ({ nombre, tipo, origen: { clase: 'constante', valor } })
const formula = (nombre: string, texto: string, tipo: TipoVariable = 'numero'): Variable => ({ nombre, tipo, origen: { clase: 'formula', texto } })

function datos(escrito: string): Tabla {
  const r = leerDatos(escrito)
  if (!r.ok) throw new Error(r.mensaje)
  return r.tabla
}

const CAUSAS = datos(
  'Causa;Fuero;Monto;Fojas\nPérez;Federal;320000;40\nGómez;Federal;850000;12\nLópez;Penal Económico;150000;60\nDíaz;Penal Económico;980000;8\nRuiz;Criminal;210000;\nSosa;Criminal;450000;25',
)

const tablaDeDatos = (nombre: string, tabla: Tabla, columnas?: ColumnaCalculada[]): Variable => ({
  nombre,
  tipo: 'tabla',
  origen: { clase: 'datos', tabla },
  ...(columnas ? { columnas } : {}),
})

const ver = (c: ReturnType<typeof crearCatalogo>, nombre: string) => {
  const e = c.estado(nombre)
  return e ? formatear(e.valor) : undefined
}

/** Una columna de la tabla de una variable, formateada. */
function columna(c: ReturnType<typeof crearCatalogo>, tabla: string, nombre: string): string[] {
  const t = c.estado(tabla)?.tabla
  const i = t?.columnas.indexOf(nombre) ?? -1
  return t && i >= 0 ? t.filas.map((f) => formatear(f[i] as Valor)) : []
}

describe('tablas escritas a mano', () => {
  it('se usan como cualquier tabla', () => {
    const c = crearCatalogo([
      tablaDeDatos('Alícuotas', datos('Tipo;Alicuota\nGeneral;0,21\nReducida;0,105\nDiferencial;0,27')),
      formula('Reducida', 'BUSCARV("Reducida"; [Alícuotas]; 2; FALSO)'),
    ])
    expect(ver(c, 'Reducida')).toBe('0,105')
    expect(c.estado('Alícuotas')?.tabla?.filas).toHaveLength(3)
    expect(c.estado('Alícuotas')?.problema).toBeUndefined()
  })

  it('esVariable las acepta, y rechaza una tabla mal formada', () => {
    expect(esVariable(tablaDeDatos('T', CAUSAS))).toBe(true)
    expect(esVariable({ nombre: 'T', tipo: 'tabla', origen: { clase: 'datos', tabla: { columnas: ['A'], filas: [[1]] } } })).toBe(false)
    expect(esVariable({ ...tablaDeDatos('T', CAUSAS), columnas: [{ nombre: 'X' }] })).toBe(false)
  })
})

describe('fórmulas que dan una tabla', () => {
  it('una variable de tipo tabla puede ser una fórmula, y se recalcula si cambia la de origen', () => {
    const c = crearCatalogo([
      tablaDeDatos('Causas', CAUSAS),
      formula('Federales', 'FILTRAR(Causas; Causas[Fuero] = "Federal")', 'tabla'),
      formula('Cuántas', 'FILAS(Federales)'),
      formula('Mayor', 'INDICE(ORDENAR(Federales; 3; -1); 1; 1)', 'texto'),
    ])
    expect(c.estado('Federales')?.tabla?.columnas).toEqual(['Causa', 'Fuero', 'Monto', 'Fojas'])
    expect(columna(c, 'Federales', 'Causa')).toEqual(['Pérez', 'Gómez'])
    expect(ver(c, 'Cuántas')).toBe('2')
    expect(ver(c, 'Mayor')).toBe('Gómez')
    const recalculadas = c.definir(tablaDeDatos('Causas', datos('Causa;Fuero;Monto;Fojas\nPaz;Federal;1;1')))
    // Primero la de origen y la fórmula; después las que la usan, en cualquier orden.
    expect(recalculadas.slice(0, 2)).toEqual(['Causas', 'Federales'])
    expect([...recalculadas].sort()).toEqual(['Causas', 'Cuántas', 'Federales', 'Mayor'])
    expect(ver(c, 'Cuántas')).toBe('1')
  })

  it('una tabla en una variable de un valor lo explica', () => {
    const c = crearCatalogo([tablaDeDatos('Causas', CAUSAS), formula('F', 'FILTRAR(Causas; Causas[Fuero] = "Federal")')])
    expect(ver(c, 'F')).toBe('#¡VALOR!')
    expect(c.estado('F')?.problema).toEqual({ clase: 'tipo', mensaje: 'Da una tabla de 2 filas y 4 columnas: declarala de tipo tabla' })
  })
})

describe('columnas calculadas', () => {
  it('se calculan fila por fila, con [@Columna], también con las anteriores y la tabla entera', () => {
    const c = crearCatalogo([
      tablaDeDatos('Causas', CAUSAS, [
        { nombre: 'Doble', formula: '[@Monto] * 2' },
        { nombre: 'Parte', formula: 'REDONDEAR([@Monto] / SUMA(Causas[Monto]); 2)' },
        { nombre: 'Cuádruple', formula: 'Causas[@Doble] * 2' },
      ]),
      formula('Total doble', 'SUMA(Causas[Doble])'),
    ])
    expect(c.estado('Causas')?.tabla?.columnas).toEqual(['Causa', 'Fuero', 'Monto', 'Fojas', 'Doble', 'Parte', 'Cuádruple'])
    expect(columna(c, 'Causas', 'Doble').slice(0, 2)).toEqual(['640000', '1700000'])
    expect(columna(c, 'Causas', 'Parte').slice(0, 2)).toEqual(['0,11', '0,29'])
    expect(columna(c, 'Causas', 'Cuádruple')[0]).toBe('1280000')
    // Usar su propia tabla no es un ciclo.
    expect(c.estado('Causas')?.problema).toBeUndefined()
    expect(c.estado('Causas')?.dependencias).toEqual([])
    expect(ver(c, 'Total doble')).toBe('5920000')
  })

  it('las otras variables que usan son dependencias: si cambian, se recalcula la tabla', () => {
    const c = crearCatalogo([constante('Factor', numero(3)), tablaDeDatos('Causas', CAUSAS, [{ nombre: 'Por factor', formula: '[@Fojas] * Factor' }]), formula('Suma', 'SUMA(Causas[Por factor])')])
    expect(c.estado('Causas')?.dependencias).toEqual(['Factor'])
    expect(ver(c, 'Suma')).toBe('435')
    expect(c.definir(constante('Factor', numero(1)))).toEqual(['Factor', 'Causas', 'Suma'])
    expect(ver(c, 'Suma')).toBe('145')
  })

  it('una columna con error de sintaxis o con un nombre repetido es un problema de la tabla', () => {
    const conError = crearCatalogo([tablaDeDatos('Causas', CAUSAS, [{ nombre: 'Mal', formula: '[@Monto] *' }])])
    expect(conError.estado('Causas')?.problema).toEqual({ clase: 'columna', columna: 'Mal', mensaje: 'La fórmula termina antes de tiempo: falta un valor' })
    expect(columna(conError, 'Causas', 'Mal')[0]).toBe('#¡VALOR!')
    const repetida = crearCatalogo([tablaDeDatos('Causas', CAUSAS, [{ nombre: 'monto', formula: '1' }])])
    expect(repetida.estado('Causas')?.problema).toEqual({ clase: 'columna', columna: 'monto', mensaje: 'Ya hay una columna monto' })
    const sinFila = crearCatalogo([tablaDeDatos('Causas', CAUSAS, [{ nombre: 'X', formula: '[@Nada]' }])])
    expect(columna(sinFila, 'Causas', 'X')[0]).toBe('#¡REF!')
  })

  it('en una consulta de tipo tabla, se agregan a las filas de la base, y se puede refrescar', async () => {
    const ventas: Tabla = { columnas: ['PRODUCTO', 'IMPORTE'], filas: [[texto('Yerba'), numero(100)], [texto('Café'), numero(250)]] }
    const c = crearCatalogo([{ nombre: 'Ventas', tipo: 'tabla', origen: { clase: 'consulta', sql: 'select * from ventas' }, columnas: [{ nombre: 'Con IVA', formula: '[@Importe] * 1,21' }] }])
    let corridas = 0
    const ejecutor: EjecutorConsultas = async () => {
      corridas++
      return ventas
    }
    await c.resolverConsultas(ejecutor)
    expect(columna(c, 'Ventas', 'Con IVA')).toEqual(['121', '302,5'])
    await c.resolverConsultas(ejecutor, { refrescar: true })
    expect(corridas).toBe(2)
  })

  it('renombrar la tabla corrige sus columnas y las de otras', () => {
    const c = crearCatalogo([
      tablaDeDatos('Causas', CAUSAS, [{ nombre: 'Doble', formula: 'Causas[@Monto] * 2' }]),
      tablaDeDatos('Otra', datos('A\n1'), [{ nombre: 'B', formula: 'FILAS(Causas) + [@A]' }]),
    ])
    c.renombrar('Causas', 'Juicios')
    expect(c.buscar('Juicios')?.columnas).toEqual([{ nombre: 'Doble', formula: 'Juicios[@Monto] * 2' }])
    expect(c.buscar('Otra')?.columnas).toEqual([{ nombre: 'B', formula: 'FILAS(Juicios) + [@A]' }])
    expect(columna(c, 'Otra', 'B')).toEqual(['7'])
  })
})

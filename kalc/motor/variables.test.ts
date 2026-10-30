import { describe, expect, it } from 'vitest'
import { fechaASerie } from './calendario.ts'
import { formatear, numero, texto, VACIO, type Valor } from './valores.ts'
import { crearCatalogo, esVariable, leerConstante, nombreEnFormula, problemaDeTipo, validarNombre, type TipoVariable, type Variable } from './variables.ts'

const constante = (nombre: string, valor: Valor, tipo: TipoVariable = 'numero'): Variable => ({ nombre, tipo, origen: { clase: 'constante', valor } })
const formula = (nombre: string, texto: string, tipo: TipoVariable = 'numero'): Variable => ({ nombre, tipo, origen: { clase: 'formula', texto } })

/** El valor formateado de una variable del catálogo. */
const ver = (c: ReturnType<typeof crearCatalogo>, nombre: string) => {
  const e = c.estado(nombre)
  return e ? formatear(e.valor) : undefined
}

describe('validarNombre y nombreEnFormula', () => {
  it.each([
    ['Alicuota', null],
    ['base_imponible', null],
    ['Base imponible', null],
    ['año.2026', null],
    ['', 'Falta el nombre'],
    [' A', 'El nombre no puede empezar ni terminar con espacios'],
    ['A1', 'Parece una referencia de celda (como A1)'],
    ['iva21', 'Parece una referencia de celda (como A1)'],
    ['verdadero', 'verdadero es un valor lógico'],
    ['a]b', 'El nombre no puede tener ]'],
  ])('«%s» → %s', (nombre, esperado) => {
    expect(validarNombre(nombre)).toBe(esperado)
  })

  it.each([
    ['Alicuota', 'Alicuota'],
    ['Base imponible', '[Base imponible]'],
    ['2026', '[2026]'],
    ['FALSO', '[FALSO]'],
  ])('%s se escribe %s', (nombre, esperado) => {
    expect(nombreEnFormula(nombre)).toBe(esperado)
  })
})

describe('leerConstante', () => {
  it.each<[string, TipoVariable, Valor | string]>([
    ['1.234,5', 'numero', numero(1234.5)],
    ['-3', 'entero', numero(-3)],
    ['50%', 'numero', numero(0.5)],
    ['', 'numero', VACIO],
    ['2,5', 'entero', 'No es un número entero'],
    ['abc', 'numero', 'No es un número (por ejemplo: 1234,5)'],
    // Una fecha escrita no es un número: se declara como fecha.
    ['31/12/2026', 'numero', 'No es un número (por ejemplo: 1234,5)'],
    ['31/12/2026', 'fecha', { tipo: 'fecha', valor: fechaASerie({ dia: 31, mes: 12, anio: 2026 }) as number }],
    ['31/02/2026', 'fecha', 'No es una fecha (dd/mm/aaaa)'],
    ['verdadero', 'logico', { tipo: 'logico', valor: true }],
    ['sí', 'logico', 'Escribí VERDADERO o FALSO'],
    // El texto se guarda tal cual, con sus espacios.
    [' hola ', 'texto', texto(' hola ')],
  ])('«%s» como %s', (escrito, tipo, esperado) => {
    const r = leerConstante(escrito, tipo)
    expect(r.ok ? r.valor : r.mensaje).toEqual(esperado)
  })
})

describe('problemaDeTipo', () => {
  it.each<[Valor, TipoVariable, string | null]>([
    [numero(3), 'numero', null],
    [numero(3), 'entero', null],
    // 0,1 + 0,2 + 0,7 = 1 a 15 dígitos: es entero, como lo vería Excel.
    [numero(0.1 + 0.2 + 0.7), 'entero', null],
    [numero(2.5), 'entero', 'Da 2,5 y se declaró número entero'],
    [texto('3'), 'numero', 'Da un texto y se declaró número'],
    [{ tipo: 'fecha', valor: 46000 }, 'numero', 'Da una fecha y se declaró número'],
    [numero(46000), 'fecha', 'Da un número y se declaró fecha'],
    [{ tipo: 'error', valor: '#¡DIV/0!' }, 'texto', null],
    [VACIO, 'logico', null],
  ])('%j como %s', (valor, tipo, esperado) => {
    expect(problemaDeTipo(valor, tipo)).toBe(esperado)
  })
})

describe('esVariable', () => {
  it('acepta constantes y fórmulas, y rechaza lo que no tiene la forma', () => {
    expect(esVariable(constante('A', numero(1)))).toBe(true)
    expect(esVariable(formula('B', 'A+1'))).toBe(true)
    expect(esVariable({ ...formula('B', 'A+1'), descripcion: 'x' })).toBe(true)
    expect(esVariable(null)).toBe(false)
    expect(esVariable({ nombre: 'A', tipo: 'moneda', origen: { clase: 'formula', texto: '1' } })).toBe(false)
    expect(esVariable({ nombre: 'A', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: '1' } } })).toBe(false)
    expect(esVariable({ nombre: 'A', tipo: 'numero', origen: { clase: 'formula' } })).toBe(false)
  })
})

describe('crearCatalogo', () => {
  it('calcula en orden de dependencias, aunque estén cargadas al revés', () => {
    const c = crearCatalogo([formula('Total', 'Neto + IVA'), formula('IVA', 'Neto * Alicuota'), constante('Neto', numero(1000)), constante('Alicuota', numero(0.21))])
    expect(ver(c, 'Total')).toBe('1210')
    expect(c.estado('Total')?.dependencias).toEqual(['Neto', 'IVA'])
    expect(c.variables().map((v) => v.nombre)).toEqual(['Total', 'IVA', 'Neto', 'Alicuota'])
  })

  it('no distingue mayúsculas en los nombres', () => {
    const c = crearCatalogo([constante('Neto', numero(10)), formula('Doble', 'NETO*2')])
    expect(ver(c, 'doble')).toBe('20')
    expect(c.buscar('neto')?.nombre).toBe('Neto')
  })

  it('acepta nombres con espacios entre corchetes', () => {
    const c = crearCatalogo([constante('Base imponible', numero(100)), formula('Impuesto', '[base imponible] * 3%')])
    expect(ver(c, 'Impuesto')).toBe('3')
  })

  it('una constante vacía vale 0 en una fórmula y "" en un texto', () => {
    const c = crearCatalogo([constante('V', VACIO), formula('N', 'V+1'), formula('T', '"x"&V&"x"', 'texto')])
    expect(ver(c, 'V')).toBe('')
    expect(ver(c, 'N')).toBe('1')
    expect(ver(c, 'T')).toBe('xx')
  })

  it('con una variable inexistente da #¿NOMBRE? y dice cuál falta', () => {
    const c = crearCatalogo([formula('A', 'B + 1')])
    expect(ver(c, 'A')).toBe('#¿NOMBRE?')
    expect(c.estado('A')?.problema).toEqual({ clase: 'faltan', nombres: ['B'] })
  })

  it('un error de sintaxis queda marcado con su posición y da #¡VALOR!', () => {
    const c = crearCatalogo([formula('A', '1 +'), formula('B', 'A * 2')])
    expect(c.estado('A')?.problema).toMatchObject({ clase: 'sintaxis', inicio: 3, fin: 3 })
    expect(ver(c, 'A')).toBe('#¡VALOR!')
    expect(ver(c, 'B')).toBe('#¡VALOR!')
  })

  it('el resultado de otro tipo se avisa, sin convertirlo', () => {
    const c = crearCatalogo([formula('A', '"3"'), formula('B', '7/2', 'entero')])
    expect(c.estado('A')).toMatchObject({ valor: texto('3'), problema: { clase: 'tipo', mensaje: 'Da un texto y se declaró número' } })
    expect(c.estado('B')?.problema).toEqual({ clase: 'tipo', mensaje: 'Da 3,5 y se declaró número entero' })
  })

  it('los errores se propagan entre variables', () => {
    const c = crearCatalogo([constante('Cero', numero(0)), formula('A', '1/Cero'), formula('B', 'A+1'), formula('C', 'SI.ERROR(B; -1)')])
    expect([ver(c, 'A'), ver(c, 'B'), ver(c, 'C')]).toEqual(['#¡DIV/0!', '#¡DIV/0!', '-1'])
  })

  it('si un nombre se repite queda el último', () => {
    const c = crearCatalogo([constante('A', numero(1)), constante('a', numero(2))])
    expect(c.variables()).toHaveLength(1)
    expect(ver(c, 'A')).toBe('2')
  })
})

describe('ciclos', () => {
  it('todas las del ciclo valen #¡CICLO!, con el camino desde cada una', () => {
    const c = crearCatalogo([formula('A', 'B+1'), formula('B', 'C+1'), formula('C', 'A+1')])
    expect([ver(c, 'A'), ver(c, 'B'), ver(c, 'C')]).toEqual(['#¡CICLO!', '#¡CICLO!', '#¡CICLO!'])
    expect(c.estado('A')?.problema).toEqual({ clase: 'ciclo', camino: ['A', 'B', 'C', 'A'] })
    expect(c.estado('B')?.problema).toEqual({ clase: 'ciclo', camino: ['B', 'C', 'A', 'B'] })
  })

  it('una variable que se usa a sí misma es un ciclo', () => {
    const c = crearCatalogo([formula('A', 'A+1')])
    expect(c.estado('A')?.problema).toEqual({ clase: 'ciclo', camino: ['A', 'A'] })
  })

  it('las que dependen de un ciclo reciben el error, pero no son parte del ciclo', () => {
    const c = crearCatalogo([formula('A', 'B'), formula('B', 'A'), formula('D', 'A*2'), constante('E', numero(5))])
    expect(ver(c, 'D')).toBe('#¡CICLO!')
    expect(c.estado('D')?.problema).toBeUndefined()
    expect(ver(c, 'E')).toBe('5')
  })

  it('aunque SI no llegue a evaluar la rama, el ciclo se marca (como Excel, que lo ve al escribir)', () => {
    const c = crearCatalogo([formula('A', 'SI(VERDADERO; 1; A)')])
    expect(ver(c, 'A')).toBe('#¡CICLO!')
  })

  it('al cortar el ciclo se recalcula todo', () => {
    const c = crearCatalogo([formula('A', 'B+1'), formula('B', 'A+1')])
    c.definir(constante('B', numero(10)))
    expect(ver(c, 'A')).toBe('11')
    expect(c.estado('A')?.problema).toBeUndefined()
  })
})

describe('recálculo incremental', () => {
  const armar = () =>
    crearCatalogo([constante('Neto', numero(100)), formula('IVA', 'Neto*21%'), formula('Total', 'Neto+IVA'), constante('Otra', numero(1)), formula('Doble', 'Otra*2')])

  it('al cambiar una variable se recalculan solo ella y las que dependen, en orden', () => {
    const c = armar()
    expect(c.definir(constante('Neto', numero(200)))).toEqual(['Neto', 'IVA', 'Total'])
    expect(ver(c, 'Total')).toBe('242')
    expect(c.recalcular('Otra')).toEqual(['Otra', 'Doble'])
  })

  it('una variable nueva conserva el lugar; una que faltaba completa a las que la usaban', () => {
    const c = crearCatalogo([formula('A', 'B*2')])
    expect(c.definir(constante('B', numero(4)))).toEqual(['B', 'A'])
    expect(ver(c, 'A')).toBe('8')
    expect(c.estado('A')?.problema).toBeUndefined()
    c.definir(formula('A', 'B*3'))
    expect(c.variables().map((v) => v.nombre)).toEqual(['A', 'B'])
  })

  it('al quitar una variable, las que la usaban dan #¿NOMBRE?', () => {
    const c = armar()
    expect(c.quitar('IVA')).toEqual(['Total'])
    expect(ver(c, 'Total')).toBe('#¿NOMBRE?')
    expect(c.estado('IVA')).toBeUndefined()
    expect(c.quitar('NoExiste')).toEqual([])
  })

  it('el contexto sirve para evaluar otras fórmulas con los valores del catálogo', async () => {
    const { evaluar } = await import('./evaluador.ts')
    const c = armar()
    expect(formatear(evaluar('Total - IVA', c.contexto()))).toBe('100')
    expect(formatear(evaluar('Nada', c.contexto()))).toBe('#¿NOMBRE?')
  })

  it('no acepta nombres inválidos', () => {
    expect(() => crearCatalogo().definir(constante('A1', numero(1)))).toThrow('referencia de celda')
  })
})

describe('renombrar', () => {
  it('cambia el nombre y corrige las fórmulas que la usan, sin tocar el resto del texto', () => {
    const c = crearCatalogo([constante('Neto', numero(100)), formula('Total', 'neto + neto*21%  & "neto"'), constante('Otra', numero(1))])
    expect(c.renombrar('Neto', 'Base imponible')).toEqual(['Base imponible', 'Total'])
    expect(c.variables().map((v) => v.nombre)).toEqual(['Base imponible', 'Total', 'Otra'])
    expect(c.buscar('Total')?.origen).toEqual({ clase: 'formula', texto: '[Base imponible] + [Base imponible]*21%  & "neto"' })
    expect(ver(c, 'Total')).toBe('121neto')
    expect(ver(c, 'Otra')).toBe('1')
  })

  it('una variable que se usa a sí misma también se corrige', () => {
    const c = crearCatalogo([formula('A', 'A+1')])
    c.renombrar('A', 'B')
    expect(c.buscar('B')?.origen).toEqual({ clase: 'formula', texto: 'B+1' })
    expect(c.estado('B')?.problema).toEqual({ clase: 'ciclo', camino: ['B', 'B'] })
  })

  it('las que nombraban al nombre nuevo sin que existiera se completan', () => {
    const c = crearCatalogo([constante('X', numero(3)), formula('A', 'Y*2')])
    c.renombrar('X', 'Y')
    expect(ver(c, 'A')).toBe('6')
  })

  it('se puede cambiar solo mayúsculas; no a un nombre que ya existe o inválido', () => {
    const c = crearCatalogo([constante('neto', numero(1)), constante('Otra', numero(2))])
    c.renombrar('neto', 'Neto')
    expect(c.buscar('neto')?.nombre).toBe('Neto')
    expect(() => c.renombrar('Neto', 'otra')).toThrow('Ya existe')
    expect(() => c.renombrar('Neto', 'B2')).toThrow('referencia de celda')
    expect(() => c.renombrar('Nada', 'X')).toThrow('No existe')
  })
})

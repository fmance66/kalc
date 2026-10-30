import { describe, expect, it } from 'vitest'
import type { Tabla } from 'kalc'
import { inicioDeNombre, sugerir } from './autocompletado.ts'

const VARIABLES = [{ nombre: 'Neto' }, { nombre: 'Alícuota' }, { nombre: 'Expedientes vigentes' }, { nombre: 'Causas', detalle: 'Tabla' }]
const CAUSAS: Tabla = { columnas: ['Fuero', 'Monto', 'Monto ajustado'], filas: [] }
const tablas = (n: string) => (n.toLowerCase() === 'causas' ? CAUSAS : undefined)
/** El cursor va donde está la `|`. */
const en = (conCursor: string) => sugerir(conCursor.replace('|', ''), conCursor.indexOf('|'), VARIABLES, tablas)
const etiquetas = (conCursor: string) => en(conCursor)?.opciones.map((o) => o.etiqueta)

describe('sugerir', () => {
  it('con un [ abierto ofrece todas las variables; sin [, nada', () => {
    expect(etiquetas('SUMA([|')).toEqual(['Neto', 'Alícuota', 'Expedientes vigentes', 'Causas'])
    expect(en('SUMA(Neto|')).toBeNull()
    expect(en('[Neto] + |')).toBeNull()
  })

  it('filtra por lo escrito, sin mayúsculas ni tildes, primero las que empiezan así', () => {
    expect(etiquetas('[alic|')).toEqual(['Alícuota'])
    expect(etiquetas('[e|')).toEqual(['Expedientes vigentes', 'Neto'])
    expect(etiquetas('[xyz|')).toEqual([])
  })

  it('inserta el nombre entre corchetes y reemplaza desde el [ (y el ] que siga)', () => {
    const s = en('1 + [exp|] * 2')!
    expect(s.opciones[0]?.insertar).toBe('[Expedientes vigentes]')
    expect([s.inicio, s.fin]).toEqual([4, 9])
    // Con el [ escrito, va entre corchetes aunque el nombre no los necesite.
    expect(en('[ne|')?.opciones[0]?.insertar).toBe('[Neto]')
  })

  it('pegado a una tabla ofrece sus columnas', () => {
    const s = en('SUMA(Causas[mon|')!
    expect(s.clase).toBe('columna')
    expect(s.tabla).toBe('Causas')
    expect(s.opciones.map((o) => o.insertar)).toEqual(['[Monto]', '[Monto ajustado]'])
    expect(etiquetas('[Causas][|')).toEqual(CAUSAS.columnas)
  })

  it('pegado a algo que no es una tabla, o adentro de un texto, nada', () => {
    expect(en('Neto[|')).toBeNull()
    expect(en('"[|')).toBeNull()
    expect(etiquetas('"a""b" & [Ne|')).toEqual(['Neto'])
  })

  it('con Ctrl+Espacio (desde) ofrece las variables para un nombre sin corchetes, y lo reemplaza entero', () => {
    const conDesde = (conCursor: string) => {
      const f = conCursor.replace('|', '')
      const c = conCursor.indexOf('|')
      return sugerir(f, c, VARIABLES, tablas, inicioDeNombre(f, c) ?? undefined)
    }
    expect(conDesde('2 * e|')?.opciones.map((o) => o.insertar)).toEqual(['[Expedientes vigentes]', 'Neto'])
    expect(conDesde('2 * |')?.opciones).toHaveLength(4)
    const s = conDesde('1 + Ne|to * 2')!
    expect([s.inicio, s.fin]).toEqual([4, 8])
    expect(conDesde('"ne|')).toBeNull()
  })

  it('después de Ctrl+Espacio la lista sigue mientras se escriba un nombre; un espacio u operador la cierra', () => {
    expect(sugerir('2 * Ali', 7, VARIABLES, tablas, 4)?.opciones.map((o) => o.etiqueta)).toEqual(['Alícuota'])
    expect(sugerir('2 * Neto ', 9, VARIABLES, tablas, 4)).toBeNull()
    expect(sugerir('2 * Neto+', 9, VARIABLES, tablas, 4)).toBeNull()
    // Se borró hasta antes de donde empezaba.
    expect(sugerir('2 *', 3, VARIABLES, tablas, 4)).toBeNull()
    // Sin Ctrl+Espacio, nada.
    expect(sugerir('2 * Ne', 6, VARIABLES, tablas)).toBeNull()
  })

  it('inicioDeNombre: dónde empieza el nombre antes del cursor; adentro de un texto, null', () => {
    expect(inicioDeNombre('SUMA(Neto', 9)).toBe(5)
    expect(inicioDeNombre('1 + ', 4)).toBe(4)
    expect(inicioDeNombre('"Ne', 3)).toBeNull()
  })
})

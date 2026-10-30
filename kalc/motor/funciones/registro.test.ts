import { describe, expect, it } from 'vitest'
import { CONTEXTO_EJEMPLOS } from './ejemplos.ts'
import { buscarFuncion, listarFunciones } from './registro.ts'
import { evaluarComoTabla } from '../evaluador.ts'
import { parsear } from '../parser.ts'

describe('registro de funciones', () => {
  const incluidas = listarFunciones().filter((f) => f.categoria)

  it('tiene las de las siete familias, también por su nombre en inglés', () => {
    for (const [nombre, alias] of [
      ['SI', 'IF'],
      ['SI.ERROR', 'IFERROR'],
      ['SUMA', 'SUM'],
      ['REDONDEAR.MAS', 'ROUNDUP'],
      ['EXTRAE', 'MID'],
      ['ESBLANCO', 'ISBLANK'],
      ['AÑO', 'YEAR'],
      ['FIN.MES', 'EOMONTH'],
      ['SUMAR.SI', 'SUMIF'],
      ['BUSCARV', 'VLOOKUP'],
    ] as const) {
      expect(buscarFuncion(alias)).toBe(buscarFuncion(nombre))
      expect(buscarFuncion(nombre)?.nombre).toBe(nombre)
    }
  })

  it.each(incluidas.map((f) => [f.nombre, f] as const))('%s tiene firma, descripción y un ejemplo que funciona', (nombre, f) => {
    expect(f.firma?.startsWith(`${nombre}(`)).toBe(true)
    expect(f.descripcion).toBeTruthy()
    // Los de tablas usan Causas, la tabla de ejemplo; los de Matrices dan una tabla.
    const p = parsear(f.ejemplo ?? '')
    if (!p.ok) throw new Error(p.error.mensaje)
    const r = evaluarComoTabla(p.arbol, CONTEXTO_EJEMPLOS)
    if (f.categoria === 'Matrices') expect(r).toHaveProperty('columnas')
    else expect('tipo' in r && r.tipo).not.toBe('error')
  })
})

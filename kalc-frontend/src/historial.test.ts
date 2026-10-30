// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { agregarAlHistorial, borrarHistorial, CLAVE_HISTORIAL, leerHistorial, MAXIMO_HISTORIAL } from './historial.ts'

describe('historial', () => {
  beforeEach(() => localStorage.clear())

  it('guarda la última primero, sin repetir, y lo lee de vuelta', () => {
    let h = agregarAlHistorial([], '1+1')
    h = agregarAlHistorial(h, ' 2*3 ')
    h = agregarAlHistorial(h, '1+1')
    expect(h).toEqual(['1+1', '2*3'])
    expect(leerHistorial()).toEqual(['1+1', '2*3'])
  })

  it('no guarda una fórmula vacía y se queda con las últimas', () => {
    expect(agregarAlHistorial(['a'], '  ')).toEqual(['a'])
    let h: string[] = []
    for (let i = 0; i < MAXIMO_HISTORIAL + 5; i++) h = agregarAlHistorial(h, String(i))
    expect(leerHistorial()).toHaveLength(MAXIMO_HISTORIAL)
    expect(leerHistorial()[0]).toBe(String(MAXIMO_HISTORIAL + 4))
  })

  it('borrado, o roto, queda vacío', () => {
    agregarAlHistorial([], '1+1')
    borrarHistorial()
    expect(leerHistorial()).toEqual([])
    localStorage.setItem(CLAVE_HISTORIAL, '{roto')
    expect(leerHistorial()).toEqual([])
  })

  it('sin almacenamiento no falla', () => {
    const roto = (): Storage => {
      throw new Error('bloqueado')
    }
    expect(agregarAlHistorial([], '1+1', roto)).toEqual(['1+1'])
    expect(leerHistorial(roto)).toEqual([])
    expect(() => borrarHistorial(roto)).not.toThrow()
  })
})

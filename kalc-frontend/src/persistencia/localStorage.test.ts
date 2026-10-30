// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { Variable } from 'kalc'
import { CLAVE, CLAVE_ANTERIOR, repositorioLocal } from './localStorage.ts'

const A: Variable = { nombre: 'A', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 1 } } }
const B: Variable = { nombre: 'B', tipo: 'numero', origen: { clase: 'formula', texto: 'A*2' }, descripcion: 'El doble' }

beforeEach(() => localStorage.clear())

describe('repositorioLocal', () => {
  it('guarda, reemplaza en su lugar y borra, sin distinguir mayúsculas', async () => {
    const r = repositorioLocal()
    await r.guardar(A)
    await r.guardar(B)
    await r.guardar({ ...A, nombre: 'a', origen: { clase: 'formula', texto: '5' } })
    expect((await r.listar()).map((v) => v.nombre)).toEqual(['a', 'B'])
    await r.borrar('b')
    expect(await r.listar()).toHaveLength(1)
  })

  it('persiste con el número de versión del formato', async () => {
    await repositorioLocal().reemplazarTodas([A, B])
    expect(JSON.parse(localStorage.getItem(CLAVE) ?? '')).toEqual({ version: 1, variables: [A, B] })
    expect(await repositorioLocal().listar()).toEqual([A, B])
  })

  it('lo guardado roto, de otra versión o con variables mal formadas no rompe: se descarta', async () => {
    localStorage.setItem(CLAVE, '{roto')
    expect(await repositorioLocal().listar()).toEqual([])
    localStorage.setItem(CLAVE, JSON.stringify({ version: 99, variables: [A] }))
    expect(await repositorioLocal().listar()).toEqual([])
    localStorage.setItem(CLAVE, JSON.stringify({ version: 1, variables: [A, { nombre: 'X' }] }))
    expect(await repositorioLocal().listar()).toEqual([A])
  })

  it('lee lo guardado con la clave de antes del cambio de nombre y al guardar lo pasa a la nueva', async () => {
    localStorage.setItem(CLAVE_ANTERIOR, JSON.stringify({ version: 1, variables: [A] }))
    const r = repositorioLocal(undefined, [B])
    expect(await r.listar()).toEqual([A])
    await r.guardar(B)
    expect(JSON.parse(localStorage.getItem(CLAVE) ?? '')).toEqual({ version: 1, variables: [A, B] })
    expect(localStorage.getItem(CLAVE_ANTERIOR)).toBeNull()
  })

  it('la primera vez lista las iniciales; vaciado a propósito, queda vacío', async () => {
    const r = repositorioLocal(undefined, [A, B])
    expect(await r.listar()).toEqual([A, B])
    await r.reemplazarTodas([])
    expect(await repositorioLocal(undefined, [A, B]).listar()).toEqual([])
  })

  it('sin almacenamiento, las variables quedan en memoria', async () => {
    const r = repositorioLocal(() => {
      throw new Error('bloqueado')
    })
    await r.guardar(A)
    expect(await r.listar()).toEqual([A])
  })
})

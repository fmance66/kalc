import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MARCA, publicando, vigilarPublicacion } from './publicacion.ts'

let carpeta: string
afterEach(() => {
  vi.useRealTimers()
  rmSync(carpeta, { recursive: true, force: true })
})

describe('publicación', () => {
  it('avisa una sola vez cuando aparece la marca', () => {
    vi.useFakeTimers()
    carpeta = mkdtempSync(join(tmpdir(), 'kalc-publicacion-'))
    const alPublicar = vi.fn()
    vigilarPublicacion(alPublicar, carpeta, 100)
    vi.advanceTimersByTime(300)
    expect(publicando(carpeta)).toBe(false)
    expect(alPublicar).not.toHaveBeenCalled()

    writeFileSync(join(carpeta, MARCA), '')
    vi.advanceTimersByTime(300)
    expect(publicando(carpeta)).toBe(true)
    expect(alPublicar).toHaveBeenCalledTimes(1)
  })

  it('dejar de mirar no avisa más', () => {
    vi.useFakeTimers()
    carpeta = mkdtempSync(join(tmpdir(), 'kalc-publicacion-'))
    const alPublicar = vi.fn()
    const parar = vigilarPublicacion(alPublicar, carpeta, 100)
    parar()
    writeFileSync(join(carpeta, MARCA), '')
    vi.advanceTimersByTime(300)
    expect(alPublicar).not.toHaveBeenCalled()
  })
})

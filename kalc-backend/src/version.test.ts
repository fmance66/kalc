import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { leerVersion } from './version.ts'

let carpeta: string
afterEach(() => rmSync(carpeta, { recursive: true, force: true }))

/** Una carpeta como la publicada o la de desarrollo, fuera de cualquier repositorio. */
function armar(archivos: Record<string, unknown>) {
  carpeta = mkdtempSync(join(tmpdir(), 'kalc-version-'))
  for (const [ruta, contenido] of Object.entries(archivos)) {
    mkdirSync(join(carpeta, ruta, '..'), { recursive: true })
    writeFileSync(join(carpeta, ruta), typeof contenido === 'string' ? contenido : JSON.stringify(contenido))
  }
  return carpeta
}

describe('leerVersion', () => {
  it('en el servidor, lo de version.json (lo escribe npm run publicar)', () => {
    const raiz = armar({
      'version.json': { version: '1.0.0', commit: '1edbbbc0', fecha: '14/10/2026', kalc: '1.4.0' },
      'package.json': { version: '9.9.9' },
    })
    expect(leerVersion(raiz)).toEqual({ version: '1.0.0', commit: '1edbbbc0', fecha: '14/10/2026', kalc: '1.4.0' })
  })

  it('sin version.json, la de package.json y la de Kalc instalado; sin git no hay commit', () => {
    const raiz = armar({ 'package.json': { version: '1.0.0' }, 'node_modules/kalc/package.json': { version: '1.4.0' } })
    expect(leerVersion(raiz)).toEqual({ version: '1.0.0', commit: null, fecha: null, kalc: '1.4.0' })
  })

  it('un version.json roto no rompe: la versión queda desconocida', () => {
    const raiz = armar({ 'version.json': '{ roto' })
    expect(leerVersion(raiz)).toEqual({ version: 'desconocida', commit: null, fecha: null, kalc: null })
  })
})

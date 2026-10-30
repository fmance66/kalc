import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Qué versión de la API está corriendo (GET /api/version): el número de package.json, el commit
 * (8 caracteres; "+cambios" si había cambios sin commitear) y la fecha en que se
 * publicó, más la versión de Kalc que usa. Sirve para confirmar qué quedó en el servidor de prueba.
 */
export interface InfoVersion {
  version: string
  commit: string | null
  fecha: string | null
  kalc: string | null
}

/**
 * En el servidor de prueba no hay git: `npm run publicar` deja todo en `version.json`, en la
 * carpeta publicada. En desarrollo no está, y se arma de package.json y de git (al arrancar).
 */
export function leerVersion(raiz: string = process.cwd()): InfoVersion {
  const json = (archivo: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(readFileSync(join(raiz, archivo), 'utf8')) as Record<string, unknown>
    } catch {
      return null
    }
  }
  const texto = (x: unknown) => (typeof x === 'string' && x ? x : null)
  const kalc = texto(json('node_modules/kalc/package.json')?.version)

  if (existsSync(join(raiz, 'version.json'))) {
    const v = json('version.json')
    return { version: texto(v?.version) ?? 'desconocida', commit: texto(v?.commit), fecha: texto(v?.fecha), kalc: texto(v?.kalc) ?? kalc }
  }
  return { version: texto(json('package.json')?.version) ?? 'desconocida', commit: commitGit(raiz), fecha: null, kalc }
}

/** El commit actual, o null fuera de un repositorio o sin git. */
export function commitGit(raiz: string = process.cwd()): string | null {
  const git = (comando: string) => execSync(`git ${comando}`, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    return git('rev-parse --short=8 HEAD') + (git('status --porcelain') ? '+cambios' : '')
  } catch {
    return null
  }
}

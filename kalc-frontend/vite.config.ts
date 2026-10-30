import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

/**
 * Versión que se muestra en el pie: el número de package.json, y el commit y la fecha del build
 * para confirmar qué quedó publicado en el servidor. "+cambios": se compiló con cambios sin
 * commitear.
 */
function version() {
  const git = (comando: string) => execSync(`git ${comando}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  // Vacío fuera de un repositorio (por ejemplo, desde un .zip) o sin commits todavía.
  let commit = ''
  try {
    // 8 caracteres (git da 7 por defecto).
    commit = git('rev-parse --short=8 HEAD') + (git('status --porcelain') ? '+cambios' : '')
  } catch {
    // Sin git: queda vacío.
  }
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const { version: numero, repository } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string
    repository?: string | { url?: string }
  }
  // El enlace del pie: "git+https://github.com/x/y.git" o "https://github.com/x/y".
  const url = (typeof repository === 'string' ? repository : repository?.url) ?? ''
  const repositorio = url.replace(/^git+/, '').replace(/.git$/, '')
  return { numero, commit, fecha, repositorio }
}

// Como variables VITE_: `define` con un nombre propio no se reemplaza en desarrollo con Vite 8.
const { numero, commit, fecha, repositorio } = version()
process.env.VITE_VERSION = numero
process.env.VITE_VERSION_COMMIT = commit
process.env.VITE_VERSION_FECHA = fecha
process.env.VITE_REPOSITORIO = repositorio

export default defineConfig({
  plugins: [vue()],
  // Rutas relativas: el build se puede publicar en cualquier subcarpeta del servidor. npm run publicar
  // la fija (KALC_BASE=/kalc/): con relativas, /kalc sin la barra final pediría /assets.
  base: process.env.KALC_BASE ?? './',
  // 7000 y 7100 los usan otros proyectos.
  // /api: kalc-backend (../kalc-backend, en el 7201; npm start lo levanta), sin CORS en desarrollo.
  server: { port: 7200, strictPort: true, open: true, proxy: { '/api': 'http://localhost:7201' } },
  preview: { port: 7200, strictPort: true },
  // PrimeVue con su tema y el motor van en un solo archivo: algo más de 500 kB.
  build: { chunkSizeWarningLimit: 800 },
})

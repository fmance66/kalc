// Publica la app en un servidor Windows con IIS (ver "Despliegue" en el README): archivos
// estáticos en la carpeta kalc del IIS, que los sirve y reenvía /kalc/api/ a kalc-backend (su
// web.config, public/web.config, va con el build). kalc-backend se publica aparte, desde su
// carpeta. El servidor sale de variables de entorno (no hay valores por defecto):
//   KALC_DESTINO  la carpeta del IIS, compartida: \\servidor\c\inetpub\wwwroot\kalc
//   KALC_URL      opcional: la dirección que se muestra al terminar (http://servidor/kalc/)
// Pasos:
//  1. compila la app con base KALC_BASE (default /kalc/) y VITE_API=<base>api
//  2. copia dist/ con robocopy a KALC_DESTINO (la carpeta del IIS)
// La conexión a la carpeta compartida (net use) tiene que estar hecha de antes, porque robocopy
// no pide credenciales. No hace falta reiniciar nada: el IIS sirve la versión nueva enseguida.
//
//   npm run publicar            compila y copia
//   npm run publicar:prueba     compila y muestra qué copiaría (robocopy /L), sin copiar
//
// Uso: node scripts/publicar.mjs [--prueba]

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const ORIGEN = `${RAIZ}dist`
const salir = (mensaje) => {
  console.error(mensaje)
  process.exit(1)
}

const DESTINO = process.env.KALC_DESTINO?.trim()
if (!DESTINO) salir('Falta KALC_DESTINO (\\\\servidor\\c\\inetpub\\wwwroot\\kalc): ver "Despliegue" en el README.')
const BASE = process.env.KALC_BASE ?? '/kalc/'
const URL_SERVIDOR = process.env.KALC_URL?.trim()
const prueba = process.argv.includes('--prueba')
// shell: npm es .cmd en Windows
const correr = (comando, env = {}) => spawnSync(comando, { cwd: RAIZ, stdio: 'inherit', shell: true, env: { ...process.env, ...env } }).status === 0

if (process.platform !== 'win32') salir('publicar usa robocopy: correrlo desde Windows.')
// Una ruta a medias (\servidor\c, sin la segunda barra) robocopy la toma relativa a la unidad
// actual y copia ahí sin avisar. Git Bash, por ejemplo, convierte \\ en \ en las variables.
if (!/^(\\\\[^\\]+\\[^\\]+|[A-Za-z]:\\)/.test(DESTINO)) {
  salir(`Destino inválido: "${DESTINO}". Tiene que ser \\\\servidor\\carpeta o X:\\carpeta (desde Git Bash, correrlo en PowerShell o cmd).`)
}
if (!/^\/(.+\/)?$/.test(BASE)) salir(`KALC_BASE inválida: "${BASE}". Tiene que empezar y terminar con /.`)

// 1. La app. La de npm run build (rutas relativas, la API del .env) no sirve: con /kalc sin la
// barra final pediría /assets, y tiene que guardar en la base a través de /kalc/api.
console.log(`Compilando la app con base ${BASE}...`)
if (!correr('npm run build', { KALC_BASE: BASE, VITE_API: `${BASE}api` }) || !existsSync(`${ORIGEN}/index.html`)) salir('Falló npm run build.')

// 2. Copia. /MIR: el destino queda igual a dist/ (borra lo que sobra, como los assets de la
// versión anterior). /R:2 /W:5: sin esto robocopy reintenta un millón de veces, 30 segundos cada
// una. /NP /NDL: salida más corta.
const js = readFileSync(`${ORIGEN}/index.html`, 'utf8').match(/assets\/index-[\w-]+\.js/)?.[0]
console.log(`${prueba ? 'Prueba (no se copia nada)' : 'Publicando'}: ${ORIGEN} -> ${DESTINO}`)
console.log(`Versión de la app: ${js ?? '(no se encontró el js en index.html)'}`)

const argumentos = [ORIGEN, DESTINO, '/MIR', '/R:2', '/W:5', '/NP', '/NDL', ...(prueba ? ['/L'] : [])]
const { status, error } = spawnSync('robocopy', argumentos, { stdio: 'inherit' })
if (error) salir(`No se pudo ejecutar robocopy: ${error.message}`)

// robocopy devuelve de 0 a 7 cuando todo salió bien (0 = nada que copiar, 1 = copió, ...) y 8 o
// más cuando algo falló. 1326: usuario o contraseña; 1219: conexión con otras credenciales.
if (status >= 8) salir(`robocopy terminó con error (código ${status}). Si es de acceso, ver "Despliegue" en el README (net use).`)
console.log(prueba ? '\nPrueba terminada: no se copió nada.' : `\nCopiado.${URL_SERVIDOR ? ` Abrir ${URL_SERVIDOR}` : ''}`)

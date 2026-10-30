// Publica la API en un servidor Windows con IIS (ver "Despliegue" en el README). kalc-frontend se
// publica aparte (npm run publicar en su carpeta), en la carpeta del IIS, que reenvía /kalc/api/ acá.
// El servidor y la URL salen de variables de entorno (no hay valores por defecto):
//   KALC_BACKEND_DESTINO  la carpeta publicada, compartida: \\servidor\c\app\kalc-backend
//   KALC_BACKEND_URL      GET /api/version a través del IIS: http://servidor/kalc/api/version
// Pasos:
//  1. compila el servidor a JavaScript (Node 18 no corre .ts) y arma publicacion/ con servidor/,
//     scripts/servicio.ps1, paquetes/ (el .tgz de kalc) y un package.json con sólo las
//     dependencias de producción, y les hace npm install (el servidor puede no tener salida a
//     internet), y version.json (lo que muestra GET /api/version: en el servidor no hay git)
//  2. crea la marca `publicando` en el destino: la API se cierra sola (src/publicacion.ts) y así
//     no quedan archivos en uso. Espera a que deje de responder
//  3. la copia con robocopy a KALC_BACKEND_DESTINO. No toca .env ni logs/ del destino
//  4. borra la marca: la tarea del servidor (que vuelve a arrancar node al minuto) levanta la
//     versión nueva. Espera a que GET /api/version responda con el commit publicado
// No hace falta entrar al servidor. La conexión a la carpeta compartida (net use) tiene que estar
// hecha de antes, porque robocopy no pide credenciales.
//
//   npm run publicar            compila, arma y copia
//   npm run publicar:prueba     compila, arma y muestra qué copiaría (robocopy /L), sin copiar
//
// Uso: node scripts/publicar.mjs [--prueba]

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const ORIGEN = `${RAIZ}publicacion`
const salir = (mensaje) => {
  console.error(mensaje)
  process.exit(1)
}

const DESTINO = process.env.KALC_BACKEND_DESTINO?.trim()
// Para saber cuándo se cerró y cuándo volvió: a través del IIS, como la usa kalc-frontend.
const URL_VERSION = process.env.KALC_BACKEND_URL?.trim()
if (!DESTINO || !URL_VERSION) {
  salir('Faltan KALC_BACKEND_DESTINO (\\\\servidor\\c\\app\\kalc-backend) y KALC_BACKEND_URL (http://servidor/kalc/api/version): ver "Despliegue" en el README.')
}
const prueba = process.argv.includes('--prueba')
// shell: npm y npx son .cmd en Windows
const correr = (comando) => spawnSync(comando, { cwd: RAIZ, stdio: 'inherit', shell: true }).status === 0

if (process.platform !== 'win32') salir('publicar usa robocopy: correrlo desde Windows.')
// Una ruta a medias (\servidor\c, sin la segunda barra) robocopy la toma relativa a la unidad
// actual y copia ahí sin avisar. Git Bash, por ejemplo, convierte \\ en \ en las variables.
if (!/^(\\\\[^\\]+\\[^\\]+|[A-Za-z]:\\)/.test(DESTINO)) {
  salir(`Destino inválido: "${DESTINO}". Tiene que ser \\\\servidor\\carpeta o X:\\carpeta (desde Git Bash, correrlo en PowerShell o cmd).`)
}

// 1. publicacion/. robocopy copia sólo lo que cambió de fecha o tamaño: se conservan las fechas
// y node_modules se reusa mientras no cambien las dependencias. Si no, cada publicación copia
// todo node_modules y choca con el oracledb*.node, que el servidor en marcha tiene abierto
// (ERROR 32).
for (const carpeta of ['servidor', 'scripts', 'paquetes']) rmSync(`${ORIGEN}/${carpeta}`, { recursive: true, force: true })
console.log('Compilando el servidor...')
if (!correr('npx tsc -p tsconfig.publicacion.json')) salir('Falló la compilación del servidor.')
const copiar = (desde, hasta) => cpSync(`${RAIZ}${desde}`, `${ORIGEN}/${hasta}`, { recursive: true, preserveTimestamps: true })
copiar('scripts/servicio.ps1', 'scripts/servicio.ps1')
copiar('paquetes', 'paquetes')

const paquete = JSON.parse(readFileSync(`${RAIZ}package.json`, 'utf8'))
// La versión instalada, no el rango: el servidor tiene que quedar con lo mismo que se probó. kalc
// queda como está (file:paquetes/kalc-X.Y.Z.tgz): el .tgz va en paquetes/.
const version = (nombre) => JSON.parse(readFileSync(`${RAIZ}node_modules/${nombre}/package.json`, 'utf8')).version
const dependencias = Object.fromEntries(
  Object.entries(paquete.dependencies).map(([nombre, rango]) => [nombre, rango.startsWith('file:') ? rango : version(nombre)]),
)
const paqueteServidor = JSON.stringify(
  {
    name: paquete.name,
    version: paquete.version,
    private: true,
    type: 'module',
    scripts: { start: 'node servidor/index.js' },
    dependencies: dependencias,
  },
  null,
  2,
)
// GET /api/version: en el servidor no hay git, así que lo que muestra va en version.json (ver
// src/version.ts). "+cambios": se publicó con cambios sin commitear.
const git = (comando) => spawnSync(`git ${comando}`, { cwd: RAIZ, encoding: 'utf8', shell: true }).stdout?.trim() ?? ''
const commit = git('rev-parse --short=8 HEAD')
writeFileSync(
  `${ORIGEN}/version.json`,
  JSON.stringify(
    {
      version: paquete.version,
      commit: commit ? commit + (git('status --porcelain') ? '+cambios' : '') : null,
      fecha: new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      kalc: version('kalc'),
    },
    null,
    2,
  ),
)

const anterior = existsSync(`${ORIGEN}/package.json`) ? readFileSync(`${ORIGEN}/package.json`, 'utf8') : null

if (anterior === paqueteServidor && existsSync(`${ORIGEN}/node_modules`)) {
  console.log('Las dependencias no cambiaron: se reusa publicacion/node_modules.')
} else {
  rmSync(`${ORIGEN}/node_modules`, { recursive: true, force: true })
  writeFileSync(`${ORIGEN}/package.json`, paqueteServidor)
  console.log('Instalando las dependencias en publicacion/...')
  console.log('Cambiaron: antes de copiar conviene detener el servicio (scripts\\servicio.ps1 -Accion detener).')
  const npm = spawnSync('npm install --omit=dev --no-audit --no-fund --maxsockets=2 --fetch-retries=5', { cwd: ORIGEN, stdio: 'inherit', shell: true })
  if (npm.status !== 0) {
    rmSync(`${ORIGEN}/package.json`, { force: true })
    salir('Falló npm install en publicacion/.')
  }
}

// 2. La marca: la API se cierra. Sin la carpeta (la primera vez) no hay API que cerrar. Una API
// anterior a la marca no se cierra: se copia igual, y puede dar ERROR 32
// si cambiaron las dependencias.
const MARCA = `${DESTINO}\\publicando`
const commitPublicado = JSON.parse(readFileSync(`${ORIGEN}/version.json`, 'utf8')).commit
/** Lo que responde GET /api/version, o null si no responde. */
const versionEnServidor = async () => {
  try {
    const r = await fetch(URL_VERSION, { signal: AbortSignal.timeout(3000) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}
/**
 * Si la API está abajo: sin respuesta, o el error del IIS cuando no llega a node (502, 503, 504).
 * Cualquier otra respuesta es que sigue arriba: una versión anterior a /api/version da 404.
 */
const apiAbajo = async () => {
  try {
    const r = await fetch(URL_VERSION, { signal: AbortSignal.timeout(3000) })
    return [502, 503, 504].includes(r.status)
  } catch {
    return true
  }
}
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms))

/** La API no se cerró: corre una versión anterior a la marca, que no sabe hacerlo. */
let sinMarca = false
if (!prueba && existsSync(DESTINO)) {
  writeFileSync(MARCA, `npm run publicar, ${new Date().toLocaleString('sv-SE')}\n`)
  process.stdout.write('Esperando que la API se cierre...')
  let cerrada = false
  for (let i = 0; i < 20 && !cerrada; i++) {
    cerrada = await apiAbajo()
    if (!cerrada) await esperar(1000)
  }
  sinMarca = !cerrada
  console.log(cerrada ? ' cerrada.' : ' sigue respondiendo (una versión anterior a la marca, que no se cierra sola): se copia igual.')
}

// 3. Copia. /MIR: el destino queda igual a publicacion/ (borra lo que sobra), salvo lo excluido:
// la configuración del servidor, los logs y la marca (se borra al final, no antes: si no, la API
// podría arrancar con la copia a medias). /R:2 /W:5: sin esto robocopy reintenta un millón de
// veces, 30 segundos cada una. /NP /NDL: salida más corta.
console.log(`${prueba ? 'Prueba (no se copia nada)' : 'Publicando'}: ${ORIGEN} -> ${DESTINO}`)

const argumentos = [ORIGEN, DESTINO, '/MIR', '/XF', '.env', 'publicando', '/XD', 'logs', '/R:2', '/W:5', '/NP', '/NDL', ...(prueba ? ['/L'] : [])]
const { status, error } = spawnSync('robocopy', argumentos, { stdio: 'inherit' })

// 4. Sin la marca, la tarea levanta lo que haya (aunque la copia haya fallado: mejor la API
// arriba que abajo).
if (!prueba) rmSync(MARCA, { force: true })
if (error) salir(`No se pudo ejecutar robocopy: ${error.message}`)

// robocopy devuelve de 0 a 7 cuando todo salió bien (0 = nada que copiar, 1 = copió, ...) y 8 o
// más cuando algo falló. 1326: usuario o contraseña; 1219: conexión con otras credenciales.
if (status >= 8) {
  salir(
    `robocopy terminó con error (código ${status}). Si es de acceso, ver "Despliegue" en el README (net use).` +
      '\nSi es ERROR 32 (archivo en uso), la API no se cerró: en el servidor, scripts\\servicio.ps1 -Accion detener, y repetir.',
  )
}
if (prueba) {
  console.log('\nPrueba terminada: no se copió nada.')
  process.exit(0)
}
// Sigue corriendo la versión anterior: no se va a reiniciar sola. Esta vez, a mano; las siguientes
// ya se cierran con la marca. Sin error: lo copiado está bien, y el resto de la publicación sigue.
if (sinMarca) {
  console.log(
    '\nCopiado, pero la API que corre es anterior a la marca y no se reinicia sola. Esta vez, en el servidor:' +
      '\n  (en la carpeta publicada) powershell -ExecutionPolicy Bypass -File .\\scripts\\servicio.ps1 -Accion reiniciar' +
      '\nDe ahí en adelante se reinicia sola al publicar.',
  )
  process.exit(0)
}

// La tarea vuelve a arrancar node al minuto de que terminó: hasta 2 minutos y medio.
process.stdout.write(`\nCopiado. Esperando que la API vuelva con ${commitPublicado ?? 'la versión nueva'}...`)
let actual = null
for (let i = 0; i < 50; i++) {
  actual = await versionEnServidor()
  if (actual && actual.commit === commitPublicado) break
  await esperar(3000)
}
if (actual && actual.commit === commitPublicado) {
  console.log(` lista: v${actual.version} (${actual.commit}), con Kalc ${actual.kalc}.`)
} else {
  salir(
    ` no volvió con esa versión (responde: ${actual ? `v${actual.version} (${actual.commit})` : 'nada'}).` +
      '\nEn el servidor: scripts\\servicio.ps1 -Accion estado (el log), o -Accion reiniciar. La primera vez, ver "Primera vez" en el README.',
  )
}

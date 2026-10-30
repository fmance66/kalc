// npm start: kalc-backend (7201, la API de variables y consultas) y la app (7200) juntos,
// en la misma terminal. kalc-backend está en ../kalc-backend (o en KALC_BACKEND_DIR) y lee su
// propio .env. Si no está o no arranca, la app sigue: las consultas dan un error que lo explica. Si
// ya está corriendo (por ejemplo, desde otra terminal), usa ese. Ctrl+C cierra los dos.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import { resolve } from 'node:path'

const PUERTO = 7201

/** Si algo ya escucha en el puerto: kalc-backend levantado por otro lado. */
const ocupado = (puerto) =>
  new Promise((listo) => {
    const s = connect(puerto, '127.0.0.1')
    s.once('connect', () => (s.destroy(), listo(true)))
    s.once('error', () => listo(false))
  })

const backend = resolve(process.env.KALC_BACKEND_DIR ?? '../kalc-backend')

// node directo, sin npm ni shell: así kill() cierra el proceso de verdad también en Windows.
const correr = (args, cwd) => spawn(process.execPath, args, { stdio: 'inherit', cwd })

let servidor = null
if (await ocupado(PUERTO)) {
  console.log(`\n[dev] Ya hay algo en el ${PUERTO} (¿kalc-backend de otra terminal?): la app usa eso.\n`)
} else if (existsSync(resolve(backend, 'src/index.ts'))) {
  servidor = correr(['--experimental-strip-types', '--no-warnings', '--watch', 'src/index.ts'], backend)
  servidor.on('exit', (codigo) => {
    if (codigo) console.error(`\n[dev] kalc-backend terminó (código ${codigo}); la app sigue sin él.\n`)
  })
} else {
  console.error(`\n[dev] No está kalc-backend en ${backend} (KALC_BACKEND_DIR): la app arranca sin consultas.\n`)
}

const app = correr(['node_modules/vite/bin/vite.js'])
app.on('exit', (codigo) => {
  servidor?.kill()
  process.exit(codigo ?? 0)
})
// Ctrl+C también llega a los hijos (comparten la consola): acá solo hay que no salir antes que ellos.
process.on('SIGINT', () => {})

import oracledb from 'oracledb'
import { crearApp } from './app.ts'
import { atributosPool, ErrorConfiguracion, leerConfiguracion, pools, type Configuracion, type DatosConexion } from './conexiones.ts'
import { ejecutorOracle, type EjecutarSql } from './consultas.ts'
import { cargarEntorno } from './entorno.ts'
import { abrirPostgres, ejecutorPostgres } from './postgres.ts'
import { publicando, vigilarPublicacion } from './publicacion.ts'
import { puertoOcupado } from './puerto.ts'
import { repositorioOracle } from './repositorioOracle.ts'
import { leerVersion } from './version.ts'

// Arranca la API: npm start (lee .env; ver .env.example). En el servidor de prueba corre
// compilado (servidor/index.js, ver scripts/publicar.mjs), desde la carpeta publicada.
cargarEntorno('.env')

// Mientras npm run publicar copia la versión nueva, no arranca: la tarea lo vuelve a intentar al
// minuto, y cuando la copia termina levanta la nueva (ver publicacion.ts).
if (publicando()) {
  console.log(`${ahora()} Se está publicando una versión nueva: la API arranca cuando termine`)
  process.exit(0)
}

let configuracion: Configuracion
try {
  configuracion = leerConfiguracion(process.env)
} catch (e) {
  if (!(e instanceof ErrorConfiguracion)) throw e
  console.error(e.message)
  process.exit(1)
}

// 7200 es kalc-frontend.
const puerto = Number(process.env.PUERTO ?? 7201)
if (await puertoOcupado(puerto)) {
  console.error(`El puerto ${puerto} ya está ocupado por otro programa (en Windows puede ser un sitio del IIS): cambiar PUERTO en el .env`)
  process.exit(1)
}

// Modo thin (el de por defecto): no hace falta Instant Client. Pide Oracle 12.1 o posterior, y no
// acepta claves con el verificador de Oracle 10g (NJS-116). Para esas, ORACLE_CLIENTE apunta a un
// Oracle Instant Client 19 o posterior y se usa el modo thick.
if (process.env.ORACLE_CLIENTE) oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENTE })

// Un pool por conexión, que se abre la primera vez que se usa (ver conexiones.ts). El del almacén
// (siempre Oracle) guarda las variables.
const deTipo = (tipo: DatosConexion['tipo']) => configuracion.conexiones.filter((c) => c.tipo === tipo)
const oracle = pools(deTipo('oracle'), (d) =>
  oracledb.createPool(atributosPool(d, d.nombre === configuracion.almacen ? { poolMin: 1, poolMax: 4 } : { poolMin: 0, poolMax: 4 })),
)
const postgres = pools(deTipo('postgres'), async (d) => abrirPostgres(d))
const pool = { getConnection: async () => (await oracle.obtener(configuracion.almacen)).getConnection() }
// Un ejecutor por cada conexión en la que pueden correr las consultas; la API ya controló que la
// que pide la variable sea una de esas.
const ejecutores = new Map(
  configuracion.consultas.map((n) => [
    n,
    deTipo('postgres').some((c) => c.nombre === n)
      ? ejecutorPostgres({ connect: async () => (await postgres.obtener(n)).connect() })
      : ejecutorOracle({ getConnection: async () => (await oracle.obtener(n)).getConnection() }),
  ]),
)
const ejecutar: EjecutarSql = async (sql, parametros, opciones = {}) => {
  const ejecutor = ejecutores.get(opciones.conexion ?? configuracion.consultas[0]!)
  if (!ejecutor) throw new Error(`No hay una conexión de consultas que se llame ${opciones.conexion}`)
  return ejecutor(sql, parametros, opciones)
}

const version = leerVersion()
const servidor = crearApp(repositorioOracle(pool), ejecutar, version, configuracion.consultas).listen(puerto, () => {
  console.log(`${ahora()} API de variables v${version.version}${version.commit ? ` (${version.commit})` : ''} en http://localhost:${puerto}/api/variables`)
})
vigilarPublicacion(() => {
  console.log(`${ahora()} Llegó una versión nueva: la API se cierra para que se copie`)
  void cerrar()
})
// Con la hora, para saber en el log del servidor de prueba cuándo arrancó y cuándo terminó.
process.on('exit', (codigo) => console.log(`${ahora()} El servidor terminó (código ${codigo})`))

/** "2026-10-13 11:50:00", la hora local. */
function ahora() {
  return new Date().toLocaleString('sv-SE')
}

async function cerrar() {
  servidor.close()
  await Promise.all([oracle.cerrar(), postgres.cerrar()])
  process.exit(0)
}
process.on('SIGINT', cerrar)
process.on('SIGTERM', cerrar)

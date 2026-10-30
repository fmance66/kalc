import type oracledb from 'oracledb'

/** Una base con su usuario: lo que hace falta para abrir un pool. */
export interface DatosConexion {
  /** En minúsculas: así se nombra en `ALMACEN`, `CONSULTAS` y en las variables de consulta. */
  nombre: string
  /** Sale del prefijo de sus variables: `ORACLE_<NOMBRE>_*` o `POSTGRES_<NOMBRE>_*`. */
  tipo: 'oracle' | 'postgres'
  usuario: string
  clave: string
  /** En Oracle, alias, descriptor o host:puerto/servicio; en PostgreSQL, host[:puerto]/base. */
  conexion: string
  /**
   * Si está, las tablas se nombran sin prefijo. En Oracle, cada sesión hace ALTER SESSION SET
   * CURRENT_SCHEMA; en PostgreSQL es el search_path, y pueden ser varios separados por coma.
   */
  esquema?: string
}

export interface Configuracion {
  conexiones: DatosConexion[]
  /** La conexión donde está `motor_variables`. */
  almacen: string
  /** Las conexiones en las que pueden correr las variables de consulta; la primera es la de por defecto. */
  consultas: string[]
}

/** Lo que falta o está mal en el `.env`; el mensaje se muestra tal cual al arrancar. */
export class ErrorConfiguracion extends Error {}

// Va en el nombre de las variables de entorno (ORACLE_REPORTES_CONEXION).
const NOMBRE = /^[a-z][a-z0-9_]*$/i
// No se puede pasar como bind en ALTER SESSION: va pegado al SQL, así que solo un identificador.
const ESQUEMA = /^[a-z][a-z0-9_$#]*$/i
// El search_path de PostgreSQL: uno o varios esquemas, separados por coma.
const ESQUEMAS_POSTGRES = /^[a-z_][a-z0-9_$]*(\s*,\s*[a-z_][a-z0-9_$]*)*$/i
// host[:puerto]/base, como el host:puerto/servicio de Oracle.
export const CONEXION_POSTGRES = /^([^\s:/]+)(?::(\d+))?\/([^\s/]+)$/

/**
 * Las conexiones del `.env`. Dos formatos (ver .env.example):
 *
 * - Con nombre: `CONEXIONES=juzgado,reportes` y por cada una `ORACLE_<NOMBRE>_USUARIO`, `_CLAVE`,
 *   `_CONEXION` y `_ESQUEMA` (opcional), o las mismas con `POSTGRES_<NOMBRE>_` si es una base
 *   PostgreSQL (solo para consultas). `ALMACEN` dice dónde está `motor_variables` (si falta, la
 *   primera), `CONSULTAS` dónde pueden correr las consultas (si falta, en todas) y
 *   `CONSULTA_POR_DEFECTO` cuál de esas se usa si la variable no dice (si falta, la primera).
 * - El de antes (sin `CONEXIONES`): `ORACLE_USUARIO`, `_CLAVE`, `_CONEXION` y `_ESQUEMA` son la
 *   conexión `principal`. Si está `ORACLE_CONSULTAS_USUARIO`, las consultas corren solo en
 *   `consultas` (ese usuario, en `ORACLE_CONSULTAS_CONEXION` o la misma base), como hasta ahora.
 */
export function leerConfiguracion(entorno: NodeJS.ProcessEnv): Configuracion {
  const lista = entorno['CONEXIONES']?.trim()
  return lista ? conNombre(lista, entorno) : anterior(entorno)
}

function requerida(entorno: NodeJS.ProcessEnv, clave: string): string {
  const valor = entorno[clave]?.trim()
  if (!valor) throw new ErrorConfiguracion(`Falta la variable de entorno ${clave} (ver .env.example)`)
  return valor
}

function datos(nombre: string, entorno: NodeJS.ProcessEnv, prefijo: string, conexion?: string): DatosConexion {
  const esquema = entorno[`${prefijo}_ESQUEMA`]?.trim()
  if (esquema && !ESQUEMA.test(esquema)) throw new ErrorConfiguracion(`${prefijo}_ESQUEMA no es un nombre de esquema: ${esquema}`)
  return {
    nombre,
    tipo: 'oracle',
    usuario: requerida(entorno, `${prefijo}_USUARIO`),
    clave: requerida(entorno, `${prefijo}_CLAVE`),
    conexion: conexion ?? requerida(entorno, `${prefijo}_CONEXION`),
    ...(esquema ? { esquema } : {}),
  }
}

function datosPostgres(nombre: string, entorno: NodeJS.ProcessEnv, prefijo: string): DatosConexion {
  // Va en el search_path, que se arma como texto: solo identificadores, sin espacios.
  const esquema = entorno[`${prefijo}_ESQUEMA`]?.trim()
  if (esquema && !ESQUEMAS_POSTGRES.test(esquema)) throw new ErrorConfiguracion(`${prefijo}_ESQUEMA no es una lista de esquemas: ${esquema}`)
  const conexion = requerida(entorno, `${prefijo}_CONEXION`)
  if (!CONEXION_POSTGRES.test(conexion)) throw new ErrorConfiguracion(`${prefijo}_CONEXION tiene que ser host[:puerto]/base: ${conexion}`)
  return {
    nombre,
    tipo: 'postgres',
    usuario: requerida(entorno, `${prefijo}_USUARIO`),
    clave: requerida(entorno, `${prefijo}_CLAVE`),
    conexion,
    ...(esquema ? { esquema: esquema.replace(/\s+/g, '') } : {}),
  }
}

/** Oracle o PostgreSQL, según con qué prefijo están sus variables; las dos a la vez es un error. */
function datosConNombre(nombre: string, entorno: NodeJS.ProcessEnv): DatosConexion {
  const oracle = `ORACLE_${nombre.toUpperCase()}`
  const postgres = `POSTGRES_${nombre.toUpperCase()}`
  const definida = (prefijo: string) => ['USUARIO', 'CLAVE', 'CONEXION'].some((d) => entorno[`${prefijo}_${d}`]?.trim())
  if (!definida(postgres)) return datos(nombre, entorno, oracle)
  if (definida(oracle)) throw new ErrorConfiguracion(`CONEXIONES: "${nombre}" tiene variables ${oracle}_* y ${postgres}_*: tiene que ser una sola base`)
  return datosPostgres(nombre, entorno, postgres)
}

/** `a, B ,c` → ['a', 'b', 'c']; los nombres en minúsculas. */
function nombres(texto: string): string[] {
  return texto
    .split(',')
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean)
}

function conNombre(lista: string, entorno: NodeJS.ProcessEnv): Configuracion {
  const declaradas = nombres(lista)
  for (const n of declaradas) {
    if (!NOMBRE.test(n)) throw new ErrorConfiguracion(`CONEXIONES: "${n}" no sirve como nombre (letras, números y _, empezando con una letra)`)
  }
  if (new Set(declaradas).size !== declaradas.length) throw new ErrorConfiguracion('CONEXIONES: hay un nombre repetido')
  const conexiones = declaradas.map((n) => datosConNombre(n, entorno))

  const existe = (variable: string, n: string) => {
    if (!declaradas.includes(n)) throw new ErrorConfiguracion(`${variable}: "${n}" no está en CONEXIONES (${declaradas.join(', ')})`)
    return n
  }
  const almacen = existe('ALMACEN', entorno['ALMACEN']?.trim().toLowerCase() || declaradas[0]!)
  // motor_variables solo está para Oracle (repositorioOracle.ts).
  if (conexiones.find((c) => c.nombre === almacen)?.tipo !== 'oracle') throw new ErrorConfiguracion(`ALMACEN: "${almacen}" es PostgreSQL; las variables se guardan en una base Oracle`)
  const consultas = entorno['CONSULTAS']?.trim() ? nombres(entorno['CONSULTAS']).map((n) => existe('CONSULTAS', n)) : declaradas
  // La de por defecto es la primera de la lista: se la pasa adelante, sin tocar el resto del orden.
  const porDefecto = entorno['CONSULTA_POR_DEFECTO']?.trim().toLowerCase()
  if (!porDefecto) return { conexiones, almacen, consultas }
  if (!consultas.includes(porDefecto)) throw new ErrorConfiguracion(`CONSULTA_POR_DEFECTO: "${porDefecto}" no está en las consultas (${consultas.join(', ')})`)
  return { conexiones, almacen, consultas: [porDefecto, ...consultas.filter((n) => n !== porDefecto)] }
}

function anterior(entorno: NodeJS.ProcessEnv): Configuracion {
  const principal = datos('principal', entorno, 'ORACLE')
  if (!entorno['ORACLE_CONSULTAS_USUARIO']?.trim()) return { conexiones: [principal], almacen: 'principal', consultas: ['principal'] }
  const consultas = datos('consultas', entorno, 'ORACLE_CONSULTAS', entorno['ORACLE_CONSULTAS_CONEXION']?.trim() || principal.conexion)
  return { conexiones: [principal, consultas], almacen: 'principal', consultas: ['consultas'] }
}

/** Los atributos del pool de una conexión: con esquema, cada sesión nueva lo fija al abrirse. */
export function atributosPool(d: DatosConexion, tamanio: { poolMin: number; poolMax: number }): oracledb.PoolAttributes {
  const { esquema } = d
  return {
    user: d.usuario,
    password: d.clave,
    connectString: d.conexion,
    ...tamanio,
    ...(esquema
      ? {
          // Corre una vez por sesión (no por cada getConnection): el pool reusa las sesiones.
          sessionCallback: (c: oracledb.Connection, _tag: string, listo: (e?: oracledb.DBError) => void) => {
            c.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${esquema}`).then(() => listo(), listo)
          },
        }
      : {}),
  }
}

/**
 * Abre el pool de cada conexión la primera vez que se pide: si una base está caída, la API arranca
 * igual y solo falla lo que la usa. Si abrirlo falla, el próximo pedido lo vuelve a intentar.
 */
export function pools<P extends { close(segundos: number): Promise<void> }>(conexiones: DatosConexion[], abrir: (d: DatosConexion) => Promise<P>) {
  const abiertos = new Map<string, Promise<P>>()
  return {
    obtener(nombre: string): Promise<P> {
      const d = conexiones.find((c) => c.nombre === nombre.toLowerCase())
      if (!d) return Promise.reject(new ErrorConfiguracion(`No hay una conexión que se llame ${nombre}`))
      let p = abiertos.get(d.nombre)
      if (!p) {
        p = abrir(d)
        abiertos.set(d.nombre, p)
        p.catch(() => abiertos.delete(d.nombre))
      }
      return p
    },
    async cerrar(): Promise<void> {
      const todos = [...abiertos.values()]
      abiertos.clear()
      await Promise.allSettled(todos.map(async (p) => (await p).close(10)))
    },
  }
}

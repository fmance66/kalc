import { ErrorConsulta, esTabla, esVariable, type CodigoError, type EjecutorConsultas, type RepositorioVariables, type Valor, type Variable } from 'kalc'

/**
 * Corre las variables de consulta en el servidor: manda el nombre y los parámetros, y el servidor
 * corre el SQL que tiene guardado (nunca el que llega) y devuelve el valor, o la tabla si la variable
 * es de tipo tabla. Un error de la consulta (sin filas, error de Oracle) vuelve como ErrorConsulta,
 * con su código y el mensaje.
 */
export function ejecutorApi(base: string, pedir: typeof fetch = (...a) => fetch(...a)): EjecutorConsultas {
  return async ({ nombre, parametros }) => {
    let r: Response
    try {
      r = await pedir(`${base}/consultas/${encodeURIComponent(nombre)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parametros }),
      })
    } catch {
      throw new Error('No se pudo conectar con el servidor')
    }
    const datos = (await r.json().catch(() => null)) as { valor?: Valor; tabla?: unknown; error?: string; codigo?: CodigoError } | null
    if (r.ok && datos?.valor) return datos.valor
    if (r.ok && esTabla(datos?.tabla)) return datos.tabla
    if (datos?.codigo) throw new ErrorConsulta(datos.codigo, datos.error ?? 'La consulta falló')
    throw new Error(`El servidor respondió ${r.status}${datos?.error ? `: ${datos.error}` : ''}`)
  }
}

/** Sin servidor (variables en el navegador) no hay base contra la que correr las consultas. */
export const sinServidor: EjecutorConsultas = async () => {
  throw new Error('Las consultas a la base necesitan el servidor (VITE_API)')
}

/**
 * Las variables en la API de kalc-backend (../kalc-backend), que las guarda en Oracle. `base` es la
 * URL de la API (`/api`: en desarrollo, Vite la redirige al servidor).
 */
export function repositorioApi(base: string, pedir: typeof fetch = (...a) => fetch(...a)): RepositorioVariables {
  const url = (nombre?: string) => `${base}/variables` + (nombre === undefined ? '' : `/${encodeURIComponent(nombre)}`)

  async function llamar(metodo: string, direccion: string, cuerpo?: unknown): Promise<Response> {
    let r: Response
    try {
      r = await pedir(direccion, {
        method: metodo,
        ...(cuerpo === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }),
      })
    } catch {
      // fetch solo lanza si no hubo respuesta: sin red, o el servidor no está levantado.
      throw new Error('No se pudo conectar con el servidor')
    }
    if (!r.ok) {
      // En desarrollo, con el servidor apagado, responde el proxy de Vite: un error sin cuerpo.
      const detalle = ((await r.json().catch(() => null)) as { error?: string } | null)?.error
      throw new Error(`El servidor respondió ${r.status}${detalle ? `: ${detalle}` : ''}`)
    }
    return r
  }

  return {
    async listar() {
      const datos: unknown = await (await llamar('GET', url())).json()
      return Array.isArray(datos) ? datos.filter(esVariable) : []
    },
    async guardar(variable: Variable) {
      await llamar('PUT', url(variable.nombre), variable)
    },
    async borrar(nombre) {
      await llamar('DELETE', url(nombre))
    },
    async reemplazarTodas(variables) {
      await llamar('PUT', url(), variables)
    },
  }
}

/** Lo que responde `GET /api/version` de kalc-backend: qué versión corre y con qué Kalc. */
export interface VersionApi {
  version: string
  commit: string | null
  fecha: string | null
  kalc: string | null
}

/**
 * La versión de kalc-backend, para el pie: confirma qué quedó publicado en el servidor. `null` si
 * no responde o no la tiene (un kalc-backend anterior a esta ruta): el pie muestra solo la de la app.
 */
export async function leerVersionApi(base: string, pedir: typeof fetch = (...a) => fetch(...a)): Promise<VersionApi | null> {
  try {
    const r = await pedir(`${base}/version`)
    const datos = (await r.json()) as Partial<VersionApi> | null
    return r.ok && typeof datos?.version === 'string' ? { version: datos.version, commit: datos.commit ?? null, fecha: datos.fecha ?? null, kalc: datos.kalc ?? null } : null
  } catch {
    return null
  }
}

/** "API v1.0.0 · 1edbbbc0 del 14/10/2026", como la versión de la app (en desarrollo, sin fecha). */
export function textoVersionApi({ version, commit, fecha }: VersionApi): string {
  return `API v${version}` + (commit ? ` · ${commit}` : '') + (fecha ? ` del ${fecha}` : '')
}

/** En qué bases pueden correr las consultas (`GET /conexiones`): la primera es la de por defecto. */
export interface ConexionesApi {
  conexiones: string[]
  porDefecto: string | null
}

/**
 * Las conexiones de kalc-backend, para elegir en qué base corre una consulta. `null` si no
 * responde o no tiene la ruta (un kalc-backend anterior): no se ofrece elegir.
 */
export async function leerConexionesApi(base: string, pedir: typeof fetch = (...a) => fetch(...a)): Promise<ConexionesApi | null> {
  try {
    const r = await pedir(`${base}/conexiones`)
    const datos = (await r.json()) as Partial<ConexionesApi> | null
    const conexiones = datos?.conexiones
    if (!r.ok || !Array.isArray(conexiones) || !conexiones.every((c) => typeof c === 'string')) return null
    return { conexiones, porDefecto: typeof datos?.porDefecto === 'string' ? datos.porDefecto : null }
  } catch {
    return null
  }
}

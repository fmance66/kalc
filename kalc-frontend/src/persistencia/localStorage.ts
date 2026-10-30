import { esVariable, type RepositorioVariables, type Variable } from 'kalc'

export const CLAVE = 'kalc:variables'
/** La de antes del cambio de nombre: si no hay nada en `CLAVE`, se lee de acá. */
export const CLAVE_ANTERIOR = 'motor-formulas:variables'
/** Sube si cambia el formato guardado; `leer` migra desde las anteriores. */
export const VERSION_FORMATO = 1

interface Guardado {
  version: number
  variables: Variable[]
}

const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * Las variables en el `localStorage` del navegador. Si no hay almacenamiento (modo privado,
 * bloqueado) o lo guardado está roto, arranca vacío y las variables duran lo que la pestaña.
 * `iniciales` es lo que lista si nunca se guardó nada (la primera visita); vaciado a propósito,
 * queda vacío.
 */
export function repositorioLocal(almacen: () => Storage = () => localStorage, iniciales: readonly Variable[] = []): RepositorioVariables {
  /** Lo que se guardó en esta pestaña: sirve de respaldo si el almacenamiento falla. */
  let enMemoria: Variable[] | null = null

  function leer(): Variable[] {
    if (enMemoria) return enMemoria
    try {
      const crudo = almacen().getItem(CLAVE) ?? almacen().getItem(CLAVE_ANTERIOR)
      if (crudo === null) return [...iniciales]
      const datos = JSON.parse(crudo) as Partial<Guardado> | null
      // Una versión más nueva (de otra pestaña con una versión más nueva de la app) no se toca.
      if (datos && datos.version === VERSION_FORMATO && Array.isArray(datos.variables)) return datos.variables.filter(esVariable)
    } catch {
      // JSON roto o sin acceso: vacío.
    }
    return []
  }

  function escribir(variables: Variable[]) {
    enMemoria = variables
    try {
      almacen().setItem(CLAVE, JSON.stringify({ version: VERSION_FORMATO, variables } satisfies Guardado))
      // Ya pasaron a la clave nueva: la vieja sobra.
      almacen().removeItem(CLAVE_ANTERIOR)
      enMemoria = null
    } catch {
      // Sin almacenamiento: quedan en memoria.
    }
  }

  return {
    listar: async () => leer(),
    async guardar(variable) {
      const variables = leer()
      const i = variables.findIndex((v) => igual(v.nombre, variable.nombre))
      if (i < 0) escribir([...variables, variable])
      else escribir(variables.map((v, j) => (j === i ? variable : v)))
    },
    async borrar(nombre) {
      escribir(leer().filter((v) => !igual(v.nombre, nombre)))
    },
    async reemplazarTodas(variables) {
      escribir([...variables])
    },
  }
}

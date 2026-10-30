import { ref, shallowRef, triggerRef } from 'vue'
import { VARIABLES_INICIALES } from './pruebas/variablesIniciales.ts'
import { crearCatalogo, type Catalogo, type EjecutorConsultas, type RepositorioVariables, type Variable } from 'kalc'
import { ejecutorApi, repositorioApi, sinServidor } from './persistencia/api.ts'
import { repositorioLocal } from './persistencia/localStorage.ts'
import { cargarConexiones, conexiones } from './conexiones.ts'

/**
 * Las variables de la app: un solo catálogo para el Probador y la página Variables. El catálogo
 * del motor no es reactivo; cada cambio avisa con `triggerRef` y se guarda en el repositorio.
 */
export const catalogo = shallowRef<Catalogo>(crearCatalogo())
/** Las que recalculó el último cambio, en orden de cálculo: la tabla las resalta. */
export const recalculadas = ref<string[]>([])

/**
 * La carga no trajo ninguna variable: la app pregunta si cargar las iniciales. Si la carga falla
 * (la API no responde) queda en false: no tiene sentido ofrecer guardar.
 */
export const sinVariablesGuardadas = ref(false)

/**
 * Lo último que falló contra el repositorio (la API caída, un error de la base). Se muestra arriba
 * de todo con un botón para reintentar; el primer guardado o carga que anda lo borra.
 * - `cargar`: la app quedó sin las variables guardadas.
 * - `guardar`: lo que se ve en pantalla no quedó guardado.
 */
export const errorPersistencia = ref<{ al: 'cargar' | 'guardar'; mensaje: string } | null>(null)

// Con VITE_API, en la base (a través del servidor); si no, en el navegador, y la primera visita ya
// con las iniciales: así la app abre con algo para probar.
let repositorio: RepositorioVariables = import.meta.env.VITE_API ? repositorioApi(import.meta.env.VITE_API) : repositorioLocal(undefined, VARIABLES_INICIALES)
// Las variables de consulta corren en el servidor; sin él, quedan con el error que lo explica.
let ejecutor: EjecutorConsultas = import.meta.env.VITE_API ? ejecutorApi(import.meta.env.VITE_API) : sinServidor

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Las que no se muestran: consultas a una conexión que el servidor no tiene y las fórmulas que las
 * usan. El almacén es compartido con desarrollo, y en el servidor de prueba las de PostgreSQL
 * (`local`) solo darían error. Siguen en la base: reemplazar todas las conserva.
 */
let ocultas: Variable[] = []

/**
 * Las conexiones contra las que ocultar, o `null` para no ocultar nada: solo en el build publicado
 * (el servidor de prueba); con npm start se ven todas.
 */
async function conexionesDelServidor(): Promise<readonly string[] | null> {
  if (import.meta.env.DEV) return null
  await cargarConexiones()
  return conexiones.value?.conexiones ?? null
}

/** Separa las que no pueden correr en `disponibles` (y las que dependen de ellas) del resto. */
export function separarOcultas(variables: readonly Variable[], disponibles: readonly string[] | null): { visibles: Variable[]; ocultas: Variable[] } {
  if (!disponibles) return { visibles: [...variables], ocultas: [] }
  const c = crearCatalogo(variables)
  const nombres = new Set<string>()
  for (const v of variables) {
    if (v.origen.clase !== 'consulta' || !v.origen.conexion || disponibles.includes(v.origen.conexion)) continue
    nombres.add(v.nombre.toLowerCase())
    // quitar devuelve las que dependían de ella, también las indirectas
    for (const n of c.quitar(v.nombre)) nombres.add(n.toLowerCase())
  }
  const oculta = (v: Variable) => nombres.has(v.nombre.toLowerCase())
  return { visibles: variables.filter((v) => !oculta(v)), ocultas: variables.filter(oculta) }
}

/** Para reemplazar todas: las de pantalla y las ocultas que no tienen el mismo nombre que una de ellas. */
function conOcultas(variables: readonly Variable[]): Variable[] {
  const nombres = new Set(variables.map((v) => v.nombre.toLowerCase()))
  return [...variables, ...ocultas.filter((v) => !nombres.has(v.nombre.toLowerCase()))]
}

/**
 * Carga las guardadas. Se llama al arrancar; los tests la llaman con otro repositorio y ejecutor.
 * Si falla no lanza: la app abre igual, sin variables, con el aviso. Las consultas se lanzan sin
 * esperarlas: la página abre enseguida y sus valores llegan después.
 */
export async function cargarVariables(
  repo: RepositorioVariables = repositorio,
  ej: EjecutorConsultas = ejecutor,
  disponibles: () => Promise<readonly string[] | null> = conexionesDelServidor,
): Promise<void> {
  repositorio = repo
  ejecutor = ej
  let variables: Variable[]
  try {
    const [todas, conexionesDisponibles] = await Promise.all([repo.listar(), disponibles()])
    const separadas = separarOcultas(todas, conexionesDisponibles)
    variables = separadas.visibles
    ocultas = separadas.ocultas
  } catch (e) {
    console.error('No se pudieron cargar las variables', e)
    errorPersistencia.value = { al: 'cargar', mensaje: mensajeDe(e) }
    sinVariablesGuardadas.value = false
    return
  }
  errorPersistencia.value = null
  catalogo.value = crearCatalogo(variables)
  recalculadas.value = []
  sinVariablesGuardadas.value = variables.length === 0
  void resolverConsultas()
}

/**
 * Corre las consultas pendientes (o las de `refrescar`) y avisa lo que cambió. Si mientras tanto se
 * cargó otro catálogo, lo de este ya no se muestra.
 */
async function resolverConsultas(refrescar: boolean | readonly string[] = false): Promise<void> {
  const c = catalogo.value
  const nombres = await c.resolverConsultas(ejecutor, { refrescar })
  if (catalogo.value === c && nombres.length > 0) avisar(nombres)
}

/** Guarda en el repositorio. Un error no se lanza: queda en `errorPersistencia`. */
async function persistir(guardar: () => Promise<void>): Promise<void> {
  try {
    await guardar()
    if (errorPersistencia.value?.al === 'guardar') errorPersistencia.value = null
  } catch (e) {
    console.error('No se pudieron guardar las variables', e)
    errorPersistencia.value = { al: 'guardar', mensaje: mensajeDe(e) }
  }
}

/**
 * Después de un error: si falló la carga, vuelve a cargar; si falló un guardado, guarda todas
 * las de pantalla (no se sabe cuáles cambios llegaron). Nunca guarda después de una carga fallida:
 * reemplazaría las guardadas por una lista incompleta.
 */
export async function reintentar(): Promise<void> {
  const error = errorPersistencia.value
  if (!error) return
  if (error.al === 'cargar') await cargarVariables()
  else await persistir(() => repositorio.reemplazarTodas(conOcultas(catalogo.value.variables())))
}

/**
 * Cómo estaban las variables antes de un cambio, por nombre en minúsculas: una copia en texto, que
 * lo que el catálogo cambie después no toca.
 */
function foto(variables: readonly Variable[]): ReadonlyMap<string, string> {
  return new Map(variables.map((v) => [v.nombre.toLowerCase(), JSON.stringify(v)]))
}

/**
 * Guarda de a una solo lo que cambió desde la foto: borra las que ya no están y guarda las nuevas o
 * distintas. Reemplazar todas pisaría lo que otro usuario cambió mientras tanto en la base. Los
 * nombres no distinguen mayúsculas: `neto` → `Neto` es guardar, no borrar.
 */
async function guardarCambios(antes: ReadonlyMap<string, string>, despues: readonly Variable[]): Promise<void> {
  const ahora = new Set(despues.map((v) => v.nombre.toLowerCase()))
  for (const [clave, json] of antes) {
    if (!ahora.has(clave)) await repositorio.borrar((JSON.parse(json) as Variable).nombre)
  }
  for (const v of despues) {
    if (antes.get(v.nombre.toLowerCase()) !== JSON.stringify(v)) await repositorio.guardar(v)
  }
}

function avisar(nombres: string[]) {
  recalculadas.value = nombres
  triggerRef(catalogo)
}

/**
 * Agrega o cambia una variable. Con `anterior` distinto, primero la renombra: el catálogo corrige
 * las fórmulas que la usaban, así que se guardan todas. Lanza un error si el nombre no sirve (un
error al guardar no: va a `errorPersistencia`).
 */
export async function definirVariable(variable: Variable, anterior: string = variable.nombre): Promise<void> {
  const c = catalogo.value
  if (anterior.toLowerCase() !== variable.nombre.toLowerCase() && c.buscar(variable.nombre)) {
    throw new Error(`Ya existe una variable «${variable.nombre}»`)
  }
  // Guardarla pisaría la oculta en la base.
  if (ocultas.some((v) => v.nombre.toLowerCase() === variable.nombre.toLowerCase())) {
    throw new Error(`Ya existe una variable «${variable.nombre}» (con una consulta que este servidor no puede correr)`)
  }
  if (anterior !== variable.nombre && c.buscar(anterior)) {
    const antes = foto(c.variables())
    const renombradas = c.renombrar(anterior, variable.nombre)
    avisar([...new Set([...renombradas, ...c.definir(variable)])])
    await persistir(() => guardarCambios(antes, c.variables()))
  } else {
    avisar(c.definir(variable))
    await persistir(() => repositorio.guardar(variable))
  }
  // Después de guardar: el servidor corre el SQL que tiene guardado.
  await resolverConsultas()
}

export async function quitarVariable(nombre: string): Promise<void> {
  avisar(catalogo.value.quitar(nombre))
  await persistir(() => repositorio.borrar(nombre))
}

/**
 * Agrega las que no están (sin distinguir mayúsculas) y no toca las que ya están, aunque sean
 * distintas: los ejemplos de PostgreSQL de la Ayuda. Las guarda de a una y corre las consultas una
 * sola vez, al final (definirVariable las correría después de cada una). Devuelve las agregadas.
 */
export async function agregarFaltantes(variables: readonly Variable[]): Promise<string[]> {
  const c = catalogo.value
  const nuevas = variables.filter((v) => !c.buscar(v.nombre))
  if (nuevas.length === 0) return []
  avisar([...new Set(nuevas.flatMap((v) => c.definir(v)))])
  await persistir(async () => {
    for (const v of nuevas) await repositorio.guardar(v)
  })
  await resolverConsultas()
  return nuevas.map((v) => v.nombre)
}

/** Reemplaza todas (importar un JSON, cargar las iniciales). */
export async function reemplazarVariables(variables: readonly Variable[]): Promise<void> {
  catalogo.value = crearCatalogo(variables)
  recalculadas.value = []
  await persistir(() => repositorio.reemplazarTodas(conOcultas(catalogo.value.variables())))
  await resolverConsultas()
}

/** Todo de nuevo: las fórmulas con funciones volátiles (HOY) y las consultas (los datos de la base cambian). */
export async function recalcularTodo(): Promise<void> {
  avisar(catalogo.value.recalcular())
  await resolverConsultas(true)
}

/** Una sola variable y las que dependen de ella; si es una consulta, la vuelve a correr. */
export async function recalcularVariable(nombre: string): Promise<void> {
  avisar(catalogo.value.recalcular(nombre))
  await resolverConsultas([nombre])
}

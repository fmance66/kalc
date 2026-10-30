/**
 * Las fórmulas que se probaron en el Probador, la última primero, en el `localStorage` del
 * navegador (es de cada uno, no va a la base). Sin almacenamiento, dura lo que la pestaña.
 */

export const CLAVE_HISTORIAL = 'kalc:historial'
/** Más que esto ya no entra cómodo debajo de la fórmula. */
export const MAXIMO_HISTORIAL = 20

export function leerHistorial(almacen: () => Storage = () => localStorage): string[] {
  try {
    const datos: unknown = JSON.parse(almacen().getItem(CLAVE_HISTORIAL) ?? '[]')
    return Array.isArray(datos) ? datos.filter((f): f is string => typeof f === 'string').slice(0, MAXIMO_HISTORIAL) : []
  } catch {
    return []
  }
}

/** La fórmula pasa adelante (si ya estaba, no se repite) y se guarda. Devuelve el historial nuevo. */
export function agregarAlHistorial(historial: readonly string[], formula: string, almacen: () => Storage = () => localStorage): string[] {
  const f = formula.trim()
  if (!f) return [...historial]
  const nuevo = [f, ...historial.filter((h) => h !== f)].slice(0, MAXIMO_HISTORIAL)
  guardar(nuevo, almacen)
  return nuevo
}

export function borrarHistorial(almacen: () => Storage = () => localStorage) {
  try {
    almacen().removeItem(CLAVE_HISTORIAL)
  } catch {
    // Sin almacenamiento: no había nada guardado.
  }
}

function guardar(historial: string[], almacen: () => Storage) {
  try {
    almacen().setItem(CLAVE_HISTORIAL, JSON.stringify(historial))
  } catch {
    // Sin almacenamiento: queda en memoria.
  }
}

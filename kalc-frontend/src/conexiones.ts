import { shallowRef } from 'vue'
import { leerConexionesApi, type ConexionesApi } from './persistencia/api.ts'

/**
 * Las conexiones de kalc-backend en las que puede correr una consulta. `null` sin servidor (las
 * variables en el navegador) o si no responde: la fila no ofrece elegir.
 */
export const conexiones = shallowRef<ConexionesApi | null>(null)

export async function cargarConexiones(base = import.meta.env.VITE_API, pedir?: typeof fetch): Promise<void> {
  conexiones.value = base ? await leerConexionesApi(base, pedir) : null
}

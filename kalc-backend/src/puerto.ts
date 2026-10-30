import { connect } from 'node:net'

/**
 * Si ya hay alguien escuchando en el puerto. Hace falta preguntarlo antes de `listen`: en Windows,
 * si el puerto lo tiene un sitio del IIS (http.sys), `listen` no falla, pero los pedidos los
 * atiende el IIS (pasó con el 8081 en el servidor de prueba).
 */
export function puertoOcupado(puerto: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolver) => {
    const socket = connect(puerto, host)
    socket.setTimeout(2000)
    socket.once('connect', () => {
      socket.destroy()
      resolver(true)
    })
    // ECONNREFUSED: nadie escucha. Sin respuesta a tiempo, tampoco.
    socket.once('error', () => resolver(false))
    socket.once('timeout', () => {
      socket.destroy()
      resolver(false)
    })
  })
}

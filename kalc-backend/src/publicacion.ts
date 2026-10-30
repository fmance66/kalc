import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Reiniciar sin entrar al servidor. `npm run publicar` crea `publicando` en la carpeta publicada
 * antes de copiar y lo borra al terminar. Mientras exista, la API no corre: si está corriendo, se
 * cierra (así no quedan archivos en uso, como el oracledb*.node), y si la tarea la vuelve a
 * arrancar, termina enseguida. Cuando el archivo ya no está, la tarea (que vuelve a arrancar node
 * al minuto de que termina, ver scripts/servicio.ps1) levanta la versión nueva.
 */
export const MARCA = 'publicando'

export const publicando = (carpeta: string = process.cwd()) => existsSync(join(carpeta, MARCA))

/** Llama a `alPublicar` (una vez) cuando aparece la marca. Devuelve cómo dejar de mirar. */
export function vigilarPublicacion(alPublicar: () => void, carpeta: string = process.cwd(), cadaMs = 2000): () => void {
  // existsSync cada tanto y no fs.watch: la marca llega por la carpeta compartida, y así no depende
  // de cómo avisa el sistema de archivos.
  const reloj = setInterval(() => {
    if (!publicando(carpeta)) return
    clearInterval(reloj)
    alPublicar()
  }, cadaMs)
  reloj.unref()
  return () => clearInterval(reloj)
}

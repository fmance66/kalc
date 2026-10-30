import { readFileSync } from 'node:fs'

/**
 * Carga un archivo `.env` (`NOMBRE=valor` por línea; `#` comenta) en `process.env`, sin pisar lo
 * que ya esté definido. A mano porque el servidor de prueba tiene Node 18, sin `--env-file` ni
 * `process.loadEnvFile`. Si el archivo no existe, no hace nada.
 */
export function cargarEntorno(archivo: string, entorno: NodeJS.ProcessEnv = process.env): void {
  let texto: string
  try {
    texto = readFileSync(archivo, 'utf8')
  } catch {
    return
  }
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*([\w.]+)\s*=\s*(.*?)\s*$/.exec(linea)
    if (!m || entorno[m[1]!] !== undefined) continue
    // Comillas opcionales, como en dotenv: el descriptor de Oracle lleva paréntesis e igual.
    entorno[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, '$2')
  }
}

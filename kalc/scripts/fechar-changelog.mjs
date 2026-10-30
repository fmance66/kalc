// Le pone el número y la fecha a lo anotado en "Sin publicar" del CHANGELOG.md y deja una sección
// "Sin publicar" nueva, vacía. La corre `npm version` (script "version"), con package.json ya en el
// número nuevo y antes del commit. Con --verificar solo revisa que haya algo anotado: va en
// "preversion", para cortar antes de que npm cambie el número.
import { readFileSync, writeFileSync } from 'node:fs'

const ARCHIVO = new URL('../CHANGELOG.md', import.meta.url)
const TITULO = '## Sin publicar'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const texto = readFileSync(ARCHIVO, 'utf8')

const inicio = texto.indexOf(TITULO)
if (inicio < 0) throw new Error(`CHANGELOG.md: falta la sección "${TITULO}"`)
const fin = texto.indexOf('\n## ', inicio + TITULO.length)
const notas = texto.slice(inicio + TITULO.length, fin < 0 ? undefined : fin).trim()
if (!notas) {
  console.error(`CHANGELOG.md: "${TITULO}" está vacía. Anotar qué cambia en la versión nueva y volver a correr npm version.`)
  process.exit(1)
}
if (process.argv.includes('--verificar')) process.exit(0)

const hoy = new Date().toLocaleDateString('sv-SE') // aaaa-mm-dd, en la hora local
writeFileSync(ARCHIVO, texto.slice(0, inicio) + `${TITULO}\n\n## [${version}] - ${hoy}` + texto.slice(inicio + TITULO.length))
console.log(`CHANGELOG.md: "${TITULO}" pasa a ser la ${version}.`)

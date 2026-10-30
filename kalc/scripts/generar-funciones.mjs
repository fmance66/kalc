// Escribe docs/funciones.md, la referencia de las funciones, con lo que dice el registro (firma,
// descripción y ejemplo) y el resultado de cada ejemplo calculado con la librería ya compilada
// (dist-lib/). Así la referencia no se escribe a mano y sale con cada paquete: la corre
// `npm run build:lib` después de compilar.
import { writeFileSync } from 'node:fs'
import { CONTEXTO_EJEMPLOS, evaluarComoTabla, formatear, listarFunciones, parsear } from '../dist-lib/index.js'

const DESTINO = new URL('../docs/funciones.md', import.meta.url)

/** El mismo orden que la solapa Funciones de kalc-frontend. Las propias (sin categoría) no hay acá. */
const CATEGORIAS = ['Lógicas', 'Matemáticas', 'Estadísticas', 'Búsqueda', 'Matrices', 'Texto', 'Fechas', 'Información']

/** Para una celda de una tabla de Markdown: la barra separa columnas. */
const celda = (s) => s.replaceAll('|', '\\|')
const codigo = (s) => `\`${celda(s)}\``

const funciones = listarFunciones()
const volatiles = funciones.filter((f) => f.volatil).flatMap((f) => [f.nombre, ...(f.alias ?? [])])
const usaVolatil = (formula) => volatiles.some((n) => new RegExp(`(^|[^\\p{L}\\p{N}._])${n.replaceAll('.', '\\.')}\\s*\\(`, 'iu').test(formula))

/** Una tabla en una sola celda: una fila por línea, los valores separados por comas. */
const filasDe = (t) => t.filas.map((f) => celda(f.map(formatear).join(', '))).join('<br>')

function resultado(f) {
  if (!f.ejemplo) return ''
  // Con HOY el resultado cambia cada día: escribirlo haría que el archivo cambie en cada build
  if (usaVolatil(f.ejemplo)) return '_cambia con la fecha_'
  const r = parsear(f.ejemplo)
  if (!r.ok) throw new Error(`El ejemplo de ${f.nombre} no se puede leer: ${f.ejemplo}`)
  const v = evaluarComoTabla(r.arbol, CONTEXTO_EJEMPLOS)
  return 'columnas' in v ? filasDe(v) : codigo(formatear(v))
}

function tablaMarkdown(t) {
  return [`| ${t.columnas.join(' | ')} |`, `|${t.columnas.map(() => ' --- ').join('|')}|`, ...t.filas.map((f) => `| ${f.map((v) => celda(formatear(v))).join(' | ')} |`)].join('\n')
}

const sinCategoria = funciones.filter((f) => !CATEGORIAS.includes(f.categoria))
if (sinCategoria.length > 0) throw new Error(`Funciones sin categoría en el catálogo: ${sinCategoria.map((f) => f.nombre).join(', ')}`)

const partes = [
  '# Funciones',
  '',
  '<!-- Generado por scripts/generar-funciones.mjs desde el registro (npm run build:lib). No editar a mano. -->',
  '',
  `Las ${funciones.length} funciones que trae Kalc. Se escriben con el nombre de Excel en castellano o en inglés`,
  '(los alias), sin distinguir mayúsculas, y los argumentos se separan con `;`. En la firma, los argumentos entre',
  'corchetes son opcionales. Las marcadas _propia de Kalc_ no existen en Excel: su descripción dice cómo se',
  'escribe lo mismo allá. Para agregar funciones propias de una aplicación, ver `registrarFuncion` en el [README](../README.md).',
  '',
  'Los resultados se calcularon con la librería. Los ejemplos de tablas usan esta, `CONTEXTO_EJEMPLOS` en la API:',
  '',
  ...Object.entries(CONTEXTO_EJEMPLOS.tablas).flatMap(([nombre, t]) => [`**${nombre}**`, '', tablaMarkdown(t), '']),
  '## Índice',
  '',
  ...CATEGORIAS.map((c) => `- [${c}](#${c.toLowerCase()})`),
]

for (const categoria of CATEGORIAS) {
  partes.push('', `## ${categoria}`, '', '| Función | Qué hace | Ejemplo | Resultado |', '| --- | --- | --- | --- |')
  for (const f of funciones.filter((f) => f.categoria === categoria)) {
    const otros = [
      ...(f.alias?.length ? [`alias: ${f.alias.join(', ')}`] : []),
      ...(f.volatil ? ['volátil'] : []),
      ...(f.propia ? ['propia de Kalc'] : []),
    ]
    const firma = codigo(f.firma ?? `${f.nombre}()`) + (otros.length ? `<br>_${celda(otros.join('; '))}_` : '')
    partes.push(`| ${firma} | ${celda(f.descripcion ?? '')} | ${f.ejemplo ? codigo(f.ejemplo) : ''} | ${resultado(f)} |`)
  }
}

writeFileSync(DESTINO, partes.join('\n') + '\n')
console.log(`docs/funciones.md: ${funciones.length} funciones.`)

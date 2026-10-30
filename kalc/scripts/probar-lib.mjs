// Prueba la librería ya compilada (dist-lib/) en Node puro, como la va a usar otra aplicación:
// si un import quedó con .ts o falta un archivo, falla acá y no en el proyecto que la instala.
// La corre `npm run build:lib` después de compilar.
import { crearCatalogo, evaluar, formatear } from '../dist-lib/index.js'

const casos = [
  [formatear(evaluar('-2^2')), '4'],
  [formatear(evaluar('SI(VERDADERO; "ok"; 1/0)')), 'ok'],
  [formatear(evaluar('TEXTO(FECHA(2026; 12; 31); "dd/mm/aaaa")')), '31/12/2026'],
  [
    formatear(
      crearCatalogo([
        { nombre: 'Neto', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 1000 } } },
        { nombre: 'Total', tipo: 'numero', origen: { clase: 'formula', texto: 'Neto * 1,21' } },
      ]).estado('Total').valor,
    ),
    '1210',
  ],
]

const fallas = casos.filter(([obtenido, esperado]) => obtenido !== esperado)
for (const [obtenido, esperado] of fallas) console.error(`dist-lib: se esperaba ${esperado} y dio ${obtenido}`)
if (fallas.length > 0) process.exit(1)
console.log('dist-lib: la librería compilada anda en Node.')

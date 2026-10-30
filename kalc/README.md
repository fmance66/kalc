# Kalc

Una **librería TypeScript** que evalúa fórmulas con la misma sintaxis y el mismo comportamiento
que Excel en castellano (`SI(A>1,5; "alto"; "bajo")`), incluidos sus errores (`#¡DIV/0!`) y sus
reglas raras (`-2^2 = 4`). Las fórmulas pueden usar **variables con nombre**. Se instala en otras
aplicaciones como un paquete (`kalc-X.Y.Z.tgz`).

> Paquete: `kalc`. Esta carpeta tiene solo la librería: la aplicación para probarla desde el
> navegador (probador, variables, funciones y ayuda) es [`kalc-frontend`](../kalc-frontend).

Es una de las tres partes de Kalc (`kalc`, `kalc-backend` y `kalc-frontend`), cada una en su
carpeta de este repositorio. La arquitectura, cómo se relacionan y cómo instalar y levantar todo
están en el [README general](../README.md).

## Estado

| Etapa | Qué incluye | |
|---|---|---|
| 1. Esqueleto | Vite + Vue, tsconfig app/lib, Vitest, cuatro solapas | ✅ |
| 2. Núcleo | valores, lexer, parser, evaluador; página Probador | ✅ |
| 3. Funciones | lógicas (`SI`, `Y`, `O`, `SI.ERROR`…), matemáticas, texto, información, fechas; página Funciones | ✅ |
| 4. Variables | catálogo, dependencias, ciclos, recálculo; página Variables con `localStorage`; página Ayuda | ✅ |
| 5. Librería | API pública congelada (1.0.0), paquete instalable, ejemplos de uso | ✅ |
| 6. Base | variables guardadas en Oracle; variables de consulta (`SELECT` con parámetros) (1.1.0); consultas de tipo tabla, con `Expedientes[Estado]`, conteos y búsquedas (1.2.0); arrays dinámicos (`FILTRAR`, `ORDENAR`…), tablas a mano y columnas calculadas con `[@Columna]` | ✅ |

Las etapas 1 a 4 nombran las páginas de la demo, que desde el 14/10/2026 están en `kalc-frontend`.

Hay 86 funciones: 85 de Excel, con su nombre en castellano y en inglés (`SI` / `IF`), y
`CONTIENE`, propia de Kalc (ver [Diferencias conocidas con Excel](#diferencias-conocidas-con-excel)); la lista
completa, con un ejemplo de cada una, está en la solapa Funciones de `kalc-frontend`. Las variables pueden ser
constantes, fórmulas que usan otras o consultas a la base (de un valor, o de todas sus filas como
una tabla de Excel), y el catálogo resuelve el orden de cálculo.

## Uso

Requiere Node 22.12 o posterior. La librería no tiene dependencias: `npm install` solo trae
TypeScript y Vitest.

```sh
npm install
npm test               # Vitest: los tests del motor
npm run test:watch
npm run typecheck      # tsc, sin DOM y con lib ES2022 (para que ande también en Node 18)
npm run build:lib      # dist-lib/, y la prueba en Node puro
npm run pack           # packs/kalc-X.Y.Z.tgz, para kalc-frontend y kalc-backend
```

Para verla andando, en el navegador, está [`kalc-frontend`](../kalc-frontend).

## Usar la librería en otra aplicación

En este repositorio, `npm run pack`, y en la otra aplicación, `npm install ../kalc/packs/kalc-1.0.0.tgz`:

```sh
# 1. en este repositorio: compila la librería, la prueba y arma el paquete
npm run pack                                    # → packs/kalc-1.0.0.tgz

# 2. en la otra aplicación
npm install ../kalc/packs/kalc-1.0.0.tgz
```

```ts
// 3. en el código de la otra aplicación
import { evaluar, formatear } from 'kalc'

formatear(evaluar('SI(1500 > 1000; "Mayor"; "Menor")'))   // "Mayor"
```

La librería no tiene dependencias. El paquete lleva
`dist-lib/`: JavaScript ES2022 con sus tipos, que anda en el navegador (con Vite no hace falta
configurar nada) y en Node. Ejemplos de uso en [Con la librería](#con-la-librería).

**Para que también instale a otros y en el pipeline.** `npm install` anota la ruta del archivo en
el `package.json` de la otra aplicación (`"kalc": "file:../kalc/packs/kalc-1.0.0.tgz"`),
y fuera de tu máquina esa ruta no existe. Conviene copiar el `.tgz` adentro del repositorio de la
otra aplicación y commitearlo:

```sh
# en la otra aplicación
mkdir -p paquetes
cp ../kalc/packs/kalc-1.0.0.tgz paquetes/
npm install ./paquetes/kalc-1.0.0.tgz   # queda "file:paquetes/kalc-1.0.0.tgz"
```

**Para pasar a una versión nueva**: sacarla acá (ver [Versiones](#versiones)), `npm run pack`, y en la
otra aplicación instalar el `.tgz` nuevo de la misma forma (reemplaza al anterior en el
`package.json`; el viejo se puede borrar). Qué cambia en cada versión está en el [CHANGELOG](CHANGELOG.md),
que viaja también en el `.tgz`; una major cambia la API: revisarlo antes de actualizar.

**Mientras se desarrollan las dos a la vez**: `npm install ../kalc` instala la carpeta enlazada, y
la otra aplicación ve los cambios cada vez que acá se corre `npm run build:lib`. No sirve para
commitear (la ruta es de tu máquina).

Desde el repositorio de git directamente no se puede instalar: `dist-lib/` no está en git.

`kalc-backend` y `kalc-frontend` la usan así, con el `.tgz` en `paquetes/`: al sacar una versión
nueva, actualizarla en los dos (sus README tienen los pasos).

## Build

| Comando | Genera | Para qué |
|---|---|---|
| `npm run build:lib` | `dist-lib/` | la librería: JavaScript + `.d.ts` de `motor/`, sin tests; después la prueba en Node puro (`scripts/probar-lib.mjs`) y regenera [docs/funciones.md](docs/funciones.md) (`scripts/generar-funciones.mjs`) |
| `npm run pack` | `packs/kalc-X.Y.Z.tgz` | el paquete para instalar en otra aplicación (compila la librería antes; crea `packs/` si no está). Un `npm pack` suelto lo deja en la raíz |

## Versiones

El número está en `package.json` y sigue [SemVer](https://semver.org/lang/es/): `patch` para
correcciones, `minor` para funciones nuevas, `major` para cambios que rompen la API de la
librería. Lo que cambia en cada una está en el [CHANGELOG](CHANGELOG.md): lo nuevo se anota en
"Sin publicar" a medida que se hace. Para sacar una versión, con todo commiteado:

```sh
npm version patch      # o minor / major
```

Revisa que "Sin publicar" tenga algo (si está vacía, corta), corre los tests y el chequeo de tipos y
sube el número. Después le pone el número y la fecha a "Sin publicar", regenera
[docs/funciones.md](docs/funciones.md), hace el commit `Versión 0.1.1` con el tag `v0.1.1` y sube
los dos al remoto. Después, `npm run pack` y actualizar el `.tgz` en `kalc-frontend` y
`kalc-backend` (ver [Usar la librería en otra aplicación](#usar-la-librería-en-otra-aplicación)).

## Qué se puede hacer

Lo que se ve en el navegador (el probador con el árbol de la fórmula, la tabla de variables, el
catálogo de funciones y la ayuda) está en [`kalc-frontend`](../kalc-frontend). Acá, lo que se hace
desde el código. La lista de funciones, con su firma, qué hace y un ejemplo con su resultado, está
en [docs/funciones.md](docs/funciones.md) (se genera desde el registro, no se edita a mano).

### Con la librería

```ts
import { evaluar, formatear } from 'kalc'

evaluar('1+2*3')               // { tipo: 'numero', valor: 7 }
formatear(evaluar('1+2*3'))    // "7"
formatear(evaluar('-2^2'))     // "4"
formatear(evaluar('"3"+1'))    // "4"
formatear(evaluar('"abc"+1'))  // "#¡VALOR!"
formatear(evaluar('1/3'))      // "0,333333333333333"
```

**Catálogo de variables.** Cada variable es una constante o una fórmula que usa otras. El
catálogo calcula en orden, detecta ciclos y, al cambiar una, recalcula solo las que dependen de
ella:

```ts
import { crearCatalogo, formatear, evaluar, numero, type Variable } from 'kalc'

const variables: Variable[] = [
  { nombre: 'Neto', tipo: 'numero', origen: { clase: 'constante', valor: numero(1000) } },
  { nombre: 'Alicuota', tipo: 'numero', origen: { clase: 'constante', valor: numero(0.21) } },
  { nombre: 'IVA', tipo: 'numero', origen: { clase: 'formula', texto: 'REDONDEAR(Neto * Alicuota; 2)' } },
  { nombre: 'Total', tipo: 'numero', origen: { clase: 'formula', texto: 'Neto + IVA' } },
]
const catalogo = crearCatalogo(variables)

formatear(catalogo.estado('Total')!.valor)   // "1210"

// definir agrega o reemplaza, y devuelve las que recalculó (en orden de cálculo)
catalogo.definir({ nombre: 'Neto', tipo: 'numero', origen: { clase: 'constante', valor: numero(2000) } })
// → ['Neto', 'IVA', 'Total']
formatear(catalogo.estado('total')!.valor)   // "2420" (sin distinguir mayúsculas)

// Otra fórmula con los valores del catálogo
formatear(evaluar('Total * 2', catalogo.contexto()))   // "4840"

// Renombrar corrige las fórmulas que la usan
catalogo.renombrar('Neto', 'Importe neto')
catalogo.buscar('IVA')!.origen   // { clase: 'formula', texto: 'REDONDEAR([Importe neto] * Alicuota; 2)' }
```

El estado de cada variable trae su valor, sus dependencias y, si algo anda mal, el `problema`:

| `problema.clase` | Cuándo | Valor |
|---|---|---|
| `sintaxis` | la fórmula no se puede leer (con `mensaje`, `inicio` y `fin`) | `#¡VALOR!` |
| `faltan` | nombra variables que no existen (`nombres`) | `#¿NOMBRE?` |
| `ciclo` | depende de sí misma (`camino: ['A', 'B', 'A']`) | `#¡CICLO!` |
| `tipo` | el resultado no es del tipo declarado (`mensaje`: "Da un texto y se declaró número") | el que dio, sin convertir |
| `pendiente` | es una consulta que no se corrió con estos parámetros, o usa una | `#N/D` |
| `consulta` | la consulta falló (`mensaje` del ejecutor) | `#¡VALOR!`, o el código del `ErrorConsulta` |

`quitar(nombre)` la borra (las que la usaban pasan a `#¿NOMBRE?`) y `recalcular()` vuelve a
calcular todo, por las funciones volátiles como `HOY`. El catálogo vive en memoria: guardarlo
(en el navegador, en una base) es cosa de la aplicación; `esVariable` sirve para validar lo que
se lee.

**Variables de consulta.** Su valor sale de un `SELECT` que devuelve un solo valor; `:Nombre`
usa otra variable como parámetro (y entra en el grafo como cualquier dependencia). El motor no
corre SQL: `resolverConsultas` le pide cada consulta a un ejecutor que da la aplicación, por
tandas (una consulta que usa otra espera a la primera), y recalcula lo que depende de ellas.
Mientras tanto valen `#N/D`, con el problema `pendiente`:

```ts
import { crearCatalogo, ErrorConsulta, formatear, numero, texto, type EjecutorConsultas } from 'kalc'

const catalogo = crearCatalogo([
  { nombre: 'Fuero', tipo: 'entero', origen: { clase: 'constante', valor: numero(1) } },
  { nombre: 'Nombre del fuero', tipo: 'texto', origen: { clase: 'consulta', sql: 'select descripcion from fueros where codigo = :Fuero' } },
])

// Recibe { nombre, sql, parametros: { Fuero: { tipo: 'numero', valor: 1 } } } y devuelve un Valor.
// Si falla, lanza: la variable da #¡VALOR! (o el código del ErrorConsulta) con el mensaje.
const ejecutor: EjecutorConsultas = async ({ sql, parametros }) => {
  const filas = await miBase.consultar(sql, parametros)
  if (filas.length === 0) throw new ErrorConsulta('#N/D', 'La consulta no devolvió filas')
  return texto(filas[0])
}

await catalogo.resolverConsultas(ejecutor)
formatear(catalogo.estado('Nombre del fuero')!.valor)   // "Federal"
```

Una consulta se vuelve a correr solo si cambian sus parámetros o su SQL. Para traer datos nuevos
de la base: `resolverConsultas(ejecutor, { refrescar: true })` (todas) o `{ refrescar: ['Nombre del fuero'] }`.
`parametrosConsulta(sql)` da los parámetros con su posición (sin contar los de adentro de textos
o comentarios, ni las conversiones de PostgreSQL como `fecha::date`, desde la 1.5.1) y
`sirveComoParametro(nombre)` dice si un nombre se puede usar así: Oracle no acepta espacios ni puntos.

**Varias bases** (desde la 1.5.0). Si la aplicación tiene más de una conexión, la variable dice en
cuál corre con `origen: { clase: 'consulta', sql, conexion: 'reportes' }`; el ejecutor la recibe
como `conexion` (sin ella, va a la de por defecto). Cambiar la conexión vuelve a correr la consulta.

**Tablas** (desde la 1.2.0). Una consulta de tipo `tabla` trae todas sus filas: el ejecutor
recibe `tabla: true` y devuelve `{ columnas, filas }` (una `Tabla`; NULL es `VACIO`). Las fórmulas
la usan como una tabla de Excel: `Expedientes[Estado]` es una columna (sin distinguir mayúsculas) y
`Expedientes` la tabla entera, dentro de las funciones que aceptan rangos:

```ts
import { crearCatalogo, formatear, numero, type EjecutorConsultas } from 'kalc'

const catalogo = crearCatalogo([
  { nombre: 'Expedientes', tipo: 'tabla', origen: { clase: 'consulta', sql: 'select id, estado from expedientes where baja is null' } },
  { nombre: 'En trámite', tipo: 'entero', origen: { clase: 'formula', texto: 'CONTAR.SI(Expedientes[Estado]; 2)' } },
])

const ejecutor: EjecutorConsultas = async ({ sql, parametros, tabla }) => {
  const r = await miBase.consultar(sql, parametros)          // { columnas: ['ID', 'ESTADO'], filas: [[1, 2], [2, 2], …] }
  if (!tabla) return numero(r.filas[0][0])
  return { columnas: r.columnas, filas: r.filas.map((f) => f.map(numero)) }
}

await catalogo.resolverConsultas(ejecutor)
formatear(catalogo.estado('En trámite')!.valor)   // "20"
catalogo.estado('Expedientes')!.tabla             // { columnas, filas }
```

Leen tablas `SUMA`, `PROMEDIO`, `MIN`, `MAX`, `Y`, `O` (como en un rango, ignoran el texto de las
celdas), las de Estadísticas (`CONTAR`, `CONTARA`, `CONTAR.BLANCO`, `CONTAR.SI`,
`CONTAR.SI.CONJUNTO`, `SUMAR.SI`, `SUMAR.SI.CONJUNTO`, `PROMEDIO.SI`, con los criterios de Excel:
`">100"`, `"<>Baja"`, `"L*"`) y las de Búsqueda (`BUSCARV`, `BUSCARX`, `COINCIDIR`, `INDICE`,
`FILAS`, `COLUMNAS`). Una columna que no existe da `#¡REF!`. El estado de
la variable trae la `tabla`, y como valor el de la celda (`#¡VALOR!` si tiene varias). Una
consulta de un valor que devuelve una tabla de una celda también sirve.

Sin catálogo, las tablas se pasan en el contexto: `evaluar('FILAS(T)', { tablas: { T: tabla } })`.
Funciones propias: el `Argumento` de una tabla o columna trae `rango()`, sus celdas fila por fila.
**Arrays dinámicos, tablas a mano y columnas calculadas.** Como en Excel 365, una operación con
una tabla o columna va celda por celda (`Causas[Monto] / 1000`, `Causas[Fuero] = "Federal"`) y,
como argumento, se lee entera: `SUMA((Causas[Fuero] = "Federal") * Causas[Monto])`. Las funciones
de Matrices devuelven tablas: `FILTRAR`, `ORDENAR`, `UNICOS`, `ELEGIRCOLS`, `TOMAR`. Las funciones
de un valor de texto (menos `CONCAT`), de información y `AÑO`, `MES` y `DIA` también van celda por
celda si reciben una columna (desde la 1.6.0): `MAYUSC(Causas[Fuero])` da una columna, y "contiene"
se escribe `FILTRAR(Causas; ESNUMERO(HALLAR("ez"; Causas[Causa])))`, como en Excel, o con la función
propia `CONTIENE` (1.7.0): `FILTRAR(Causas; CONTIENE(Causas[Causa]; "ez"))`. Una función propia de
la aplicación hace lo mismo con `porCelda: true` en su `DefinicionFuncion`. Como valor suelto, una tabla da `#¡VALOR!`
(salvo una celda); `evaluarComoTabla(arbol, contexto)` la devuelve entera. En el catálogo:

```ts
import { crearCatalogo, leerDatos } from 'kalc'

const alicuotas = leerDatos('Tipo;Alicuota\nGeneral;0,21\nReducida;0,105')   // { ok: true, tabla }
const catalogo = crearCatalogo([
  // Tabla escrita a mano (clase datos), con una columna calculada: [@Alicuota] es la celda de cada fila.
  { nombre: 'Alícuotas', tipo: 'tabla', origen: { clase: 'datos', tabla: alicuotas.ok ? alicuotas.tabla : { columnas: [], filas: [] } },
    columnas: [{ nombre: 'Porcentaje', formula: 'TEXTO([@Alicuota]; "0,0%")' }] },
  // Tabla que sale de una fórmula.
  { nombre: 'Reducidas', tipo: 'tabla', origen: { clase: 'formula', texto: 'FILTRAR(Alícuotas; Alícuotas[Alicuota] < 0,2)' } },
])
catalogo.estado('Alícuotas')!.tabla!.columnas   // ['Tipo', 'Alicuota', 'Porcentaje']
```

Una columna calculada puede usar las anteriores, otras variables (son dependencias) y la misma
tabla entera (`[@Monto] / SUMA(Causas[Monto])`), sin que sea un ciclo. Con un error de sintaxis o
un nombre repetido, el estado tiene el problema `columna`. `leerDatos` lee una tabla escrita
(primera línea, las columnas; celdas separadas con `;` o tabulación, como al pegar desde Excel) y
`escribirDatos` la vuelve a escribir. Funciones propias que devuelven tablas: `evaluarRango` en la
`DefinicionFuncion`.

`CONTEXTO_EJEMPLOS` tiene la tabla `Causas` (causa, fuero, monto, fojas) que usan los ejemplos del
registro: así la solapa Funciones los calcula sin una base.

**Variables sueltas.** Sin catálogo, los valores se pasan en el contexto, sin distinguir
mayúsculas. Un nombre con espacios va entre corchetes. `Neto` y `[Neto]` son lo mismo: los
corchetes se pueden poner siempre, y hacen falta con espacios u otros signos o con un nombre que es
un lógico (`[Verdadero]` es la variable; `Verdadero`, el valor).
`nombreEnFormula` da la forma mínima (`Neto`, `[Base imponible]`):

```ts
const variables = {
  Alicuota: { tipo: 'numero', valor: 0.21 },
  'Base imponible': { tipo: 'numero', valor: 150000 },
} as const

formatear(evaluar('[Base imponible]*alicuota', { variables }))  // "31.500"
formatear(evaluar('X+1', { variables }))                        // "#¿NOMBRE?" (no existe)

// También se puede pasar una función que las busque (por ejemplo, contra una base)
evaluar('Tope*2', { variables: (nombre) => buscarEnAlgunLado(nombre) })
```

**Fechas.** Se guardan como el número de serie de Excel y operan como número:

```ts
import { fechaASerie } from 'kalc'

const variables = { Vto: { tipo: 'fecha', valor: fechaASerie({ anio: 2026, mes: 12, dia: 31 })! } } as const
formatear(evaluar('Vto+30', { variables }))            // "30/01/2027" (sigue siendo fecha)
formatear(evaluar('Vto-"1/1/2026"', { variables }))   // "364" (días)
```

**Errores de sintaxis con posición**, para subrayarlos en una pantalla:

```ts
import { parsear, dependencias } from 'kalc'

parsear('SI(A,1,2)')
// { ok: false, error: { mensaje: 'Los argumentos se separan con punto y coma (;); la coma es
//   el separador decimal', inicio: 4, fin: 5 } }

const r = parsear('A + a * [Base imponible] - B')
if (r.ok) dependencias(r.arbol)  // ['A', 'Base imponible', 'B']
```

`evaluar` lanza `ErrorSintaxis` (con `.posicion`) si la fórmula no se puede leer, igual que Excel,
que no deja ni escribirla. Para mostrar el error sin excepción: `parsear` y después
`evaluarArbol`.

**Funciones propias.** Cada función recibe sus argumentos **sin evaluar** y decide cuáles
evaluar (así funciona el cortocircuito de `SI`). Para convertirlos como Excel están
`argNumero`, `argEntero`, `argTexto` y `aLogico`, que devuelven el valor o el error a propagar;
para armar el resultado, `numero`, `texto`, `logico`, `fecha` y `error`:

```ts
import { registrarFuncion, argNumero, numero, error } from 'kalc'

registrarFuncion({
  nombre: 'TOPE',
  alias: ['CAP'],       // otros nombres que también se aceptan
  // sin categoria: en el catálogo de kalc-frontend va en "Propias"
  minimo: 2,
  maximo: 2,            // con otra cantidad de argumentos da #¡VALOR!
  firma: 'TOPE(importe; tope)',
  descripcion: 'El importe, sin pasarse del tope.',
  ejemplo: 'TOPE(1500; 1000)',
  evaluar: ([importe, tope]) => {
    const i = argNumero(importe)          // "3" → 3, VERDADERO → 1, "abc" → #¡VALOR!
    if (typeof i !== 'number') return i   // el error se propaga
    const t = argNumero(tope)
    if (typeof t !== 'number') return t
    return t < 0 ? error('#¡NUM!') : numero(Math.min(i, t))
  },
})

formatear(evaluar('TOPE(1500; 1000)'))   // "1000"
formatear(evaluar('cap("abc"; 1000)'))   // "#¡VALOR!"
```

El registro es global: una función registrada vale para todas las evaluaciones y catálogos.
Registrar con un nombre que ya existe la reemplaza.

### API pública

Congelada desde la 1.0.0 (`motor/index.test.ts` lista lo exportado): sacar o cambiar algo
es una versión major; agregar, minor.

| Para | Qué |
|---|---|
| Evaluar | `evaluar(formula, contexto?)`, `parsear(formula)`, `evaluarArbol(arbol, contexto?)`, `ErrorSintaxis` |
| Árbol | `dependencias(arbol)`, `hijos(nodo)`; tipos `Nodo`, `OperadorBinario`, `Posicion` |
| Variables | `crearCatalogo(variables)`, `validarNombre`, `nombreEnFormula`, `leerConstante`, `problemaDeTipo`, `esVariable`; tipos `Variable`, `Catalogo`, `EstadoVariable`, `Problema`, `TipoVariable` |
| Consultas | `ErrorConsulta`, `parametrosConsulta(sql)`, `sirveComoParametro(nombre)`; tipos `Consulta`, `EjecutorConsultas`, `ParametroConsulta` (desde la 1.1.0). `codigoSql(sql)`: el SQL con textos y comentarios tapados, para validarlo (próxima versión) |
| Persistencia | tipo `RepositorioVariables` (`listar`, `guardar`, `borrar`, `reemplazarTodas`): dónde guarda las variables la aplicación (próxima versión) |
| Tablas | `esTabla`, `CONTEXTO_EJEMPLOS`; tipos `Tabla`, `Rango`; `tablas` en el `Contexto`, `tabla` en `EstadoVariable` y `Consulta`, `rango` en `Argumento`, el tipo `'tabla'` en `TipoVariable` (desde la 1.2.0). `evaluarComoTabla`, `leerDatos`, `escribirDatos`; tipo `ColumnaCalculada`; `fila` en el `Contexto`, la clase `'datos'`, `columnas` en `Variable`, el problema `'columna'`, `evaluarRango` en `DefinicionFuncion`, la categoría `'Matrices'` (desde la 1.3.0) |
| Valores | `formatear`, `numeroATexto`, `textoANumero`, `aNumero`, `aTexto`, `comparar`, `esError`, `redondear15`; constructores `numero`, `texto`, `logico`, `fecha`, `error`, `VACIO`; tipos `Valor`, `ValorError`, `CodigoError` |
| Fechas | `fechaASerie({ anio, mes, dia })`, `serieAFecha(serie)`; tipo `FechaCivil` |
| Funciones | `registrarFuncion`, `buscarFuncion`, `listarFunciones`, `argNumero`, `argEntero`, `argTexto`, `aLogico`; tipos `DefinicionFuncion`, `Argumento`, `Categoria` |

Los números son `number` de JavaScript (doble precisión), igual que en Excel: se redondea a 15
dígitos al mostrar y al comparar, y `REDONDEAR` corrige los importes. No se usa decimal exacto
para dar los mismos resultados que Excel.

## Sintaxis

Como Excel con configuración regional de Argentina:

| | Ejemplo |
|---|---|
| `=` inicial | no hace falta; se acepta para poder pegar fórmulas copiadas de Excel |
| Separador de argumentos | `;` → `SI(A; 1; 2)` |
| Separador decimal | `,` → `1,5` (también `1,5E+3`) |
| Texto | `"hola"`; las comillas se duplican: `"dijo ""hola"""` |
| Lógicos | `VERDADERO`, `FALSO` (también `TRUE`, `FALSE`) |
| Errores | `#N/D`, `#¡VALOR!`, `#¡DIV/0!`… (también en inglés: `#N/A`) |
| Variables | `Alicuota`, `base_imponible`, `[Base imponible]` |
| Tablas | `Expedientes[Estado]` (una columna; el corchete pegado al nombre), `[Mis expedientes][Estado]`, `Expedientes` (la tabla entera); en una columna calculada, `[@Alta]` o `Expedientes[@Alta]` (la celda de esa fila; con espacios, `[@[Fecha de alta]]`) |
| Funciones | en castellano, con el nombre en inglés como alias; sin distinguir mayúsculas |

Operadores, de mayor a menor precedencia (todos asocian a izquierda):

| Orden | Operador | Ejemplo |
|---|---|---|
| 1 | `-` unario | `-2^2` = 4 (antes que `^`, no como en matemática) |
| 2 | `%` | `50%` = 0,5 |
| 3 | `^` | `2^3^2` = 64 (asocia a izquierda) |
| 4 | `*` `/` | |
| 5 | `+` `-` | |
| 6 | `&` | `"Total: "&1234,5` = `Total: 1234,5` |
| 7 | `=` `<>` `<` `>` `<=` `>=` | |

### Reglas de Excel que se respetan

| Fórmula | Resultado | Por qué |
|---|---|---|
| `"3"+1` | 4 | un texto con un número se convierte en la aritmética |
| `VERDADERO+1` | 2 | VERDADERO vale 1 |
| `"abc"+1` | `#¡VALOR!` | |
| `""+1` | `#¡VALOR!` | el texto vacío no es 0 (una variable vacía, sí) |
| `"1">99999` | VERDADERO | al comparar no se convierte: número < texto < lógico |
| `"a"="A"` | VERDADERO | el texto se compara sin distinguir mayúsculas |
| `0,1+0,2=0,3` | VERDADERO | se compara y se muestra a 15 dígitos significativos |
| `1/0+#N/D` | `#¡DIV/0!` | se propaga el primer error, de izquierda a derecha |
| `0^0` | `#¡NUM!` | |
| `1,5&""` | `1,5` | un número concatenado, con coma y sin separador de miles |
| `10^15&""` | `1E+15` | notación científica desde 15 dígitos |
| `+"abc"` | `abc` | el `+` unario se ignora |

Una variable **vacía** vale 0 en aritmética, `""` en texto y FALSO en lógica, como una celda
vacía. Una fórmula nunca da vacío: la fórmula `V` con `V` vacía da 0.

## Guardar las variables y correr consultas

El motor no guarda nada ni corre SQL: define las interfaces `RepositorioVariables` (dónde se
guardan) y `EjecutorConsultas` (quién corre el `SELECT` de una variable de consulta), y cada
aplicación pone las suyas. [`kalc-backend`](../kalc-backend) las implementa contra Oracle (tabla
`motor_variables`; las consultas corren en Oracle o en PostgreSQL) y [`kalc-frontend`](../kalc-frontend) las usa por HTTP, o guarda en el navegador
sin backend. Los ejemplos de consultas, contra la base PostgreSQL de ejemplo (`db/postgres/` de
`kalc-backend`), están en el README de `kalc-frontend`.

## Arquitectura

```
"A*(1+21%)"
     │  lexer.ts      texto → tokens (números es-AR, textos, nombres, [nombres], errores, operadores)
     ▼
  tokens
     │  parser.ts     tokens → árbol, por precedencia de operadores (Pratt); errores con posición
     ▼
  árbol (ast.ts)      cada nodo guarda inicio/fin en el texto → subrayar errores, resaltar en la UI
     │  evaluador.ts  árbol + contexto (variables) → Valor
     ▼
  Valor (valores.ts)  { tipo: 'numero', valor: 1.21 }  → formatear() → "1,21"
```

```
motor/                LA LIBRERÍA: TypeScript puro, sin Vue ni DOM
    index.ts          API pública (lo único que se exporta)
    valores.ts        tipos de valor, errores, coerciones, formato
    calendario.ts     números de serie de fecha de Excel (con el falso 29/02/1900)
    lexer.ts          texto → tokens; ErrorSintaxis
    parser.ts         tokens → árbol
    ast.ts            tipos de nodos, hijos(), dependencias()
    evaluador.ts      árbol → Valor: operadores, comparación entre tipos, llamadas a funciones
    variables.ts      catálogo: dependencias, orden de cálculo, ciclos, recálculo, tipos
    consultas.ts      variables de consulta: parámetros del SQL, EjecutorConsultas
    tablas.ts         Tabla y Rango: columnas por nombre, una tabla usada como valor; leerDatos/escribirDatos
    repositorio.ts    RepositorioVariables: la interfaz que implementan kalc-frontend y kalc-backend
    funciones/
      registro.ts     registrarFuncion, buscarFuncion, listarFunciones
      comunes.ts      conversión de argumentos (también rangos), redondeo de Excel
      criterios.ts    criterios de CONTAR.SI / SUMAR.SI y búsqueda (comodines, aproximada)
      ejemplos.ts     la tabla Causas de los ejemplos (CONTEXTO_EJEMPLOS)
      matrices.ts     FILTRAR, ORDENAR, UNICOS, ELEGIRCOLS, TOMAR (devuelven tablas: evaluarRango)
      formato.ts      códigos de formato de TEXTO ("#.##0,00", "dd/mm/aaaa")
      logicas.ts, matematicas.ts, estadisticas.ts, busqueda.ts, texto.ts, fechas.ts, informacion.ts
    *.test.ts         tests al lado del código; casos-excel.test.ts junta los casos raros
scripts/
  probar-lib.mjs      prueba dist-lib/ en Node puro después de compilarla
```

Decisiones de diseño:

- **Los valores tienen tipo** (`numero`, `texto`, `logico`, `fecha`, `error`, `vacio`). Excel
  también los tiene aunque no se vean, y sin ellos no se pueden reproducir sus resultados
  (`"1">99999`).
- **La fecha es un tipo propio** que opera como su número de serie: `fecha + n` da otra fecha y
  `fecha - fecha` da días. Concatenada aparece el número (`46387`), como en Excel.
- **Los errores son valores, no excepciones**: `#¡DIV/0!` viaja por la fórmula como cualquier
  otro resultado. Solo el error de sintaxis es una excepción.
- **Las funciones reciben thunks**: el evaluador no evalúa los argumentos antes de llamar. Así
  `SI(VERDADERO; 1; 1/0)` puede dar 1 sin tocar el `1/0`.
- **El motor no depende del navegador**: `tsconfig.lib.json` compila sin las definiciones del
  DOM, así que si algo de `motor/` usa `window` o `document`, no compila.
- **Imports con extensión `.ts`** (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`):
  el motor se puede importar desde Node sin compilar, y al compilar pasan a `.js`.
- TypeScript estricto: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`.

## Tests

Tests en tabla (`[fórmula, resultado esperado]`), uno por regla. `casos-excel.test.ts` junta los
casos raros: `-2^2`, `2^3^2`, `"1">99999`, `0,1+0,2=0,3`, el 29/02/1900.

> Los resultados esperados siguen el comportamiento documentado de Excel 365. **Falta
> confirmarlos en un Excel real** y anotar la versión usada.

## Diferencias conocidas con Excel

- Una función con argumentos de más o de menos da `#¡VALOR!` al evaluar; Excel no deja ni
  escribirla.
- Un texto como `"1.5"` no se convierte en número (Excel en castellano a veces lo toma como
  fecha, el 1 de mayo).
- No hay celdas ni rangos (`A1:A10`): solo variables con nombre y tablas (de una consulta, una
  fórmula o datos a mano). De las referencias de tabla están la columna, la tabla entera y
  `[@Columna]` en columnas calculadas; no `[#Totales]` ni rangos de columnas (`[[A]:[C]]`).
- Una tabla no se desborda en celdas: en una variable de un valor da `#¡VALOR!`; va en una de tipo
  tabla. De las funciones de un valor, van celda por celda con una columna las de texto, las de
  información y `AÑO`, `MES` y `DIA`; las demás (`SI`, `REDONDEAR`…) todavía no, como sí en Excel
  365: para eso, una columna calculada. `FILTRAR`, `UNICOS` y `TOMAR` sin resultado dan `#N/D`
  (Excel, `#¡CALC!`). `BUSCARX` solo hace la búsqueda exacta, sin los modos de búsqueda.
- Hay funciones **propias de Kalc**, que Excel no tiene (`CONTIENE`): la referencia de funciones
  las marca y su descripción dice cómo se escribe lo mismo en Excel. Una fórmula que las use, copiada
  a Excel, da `#¿NOMBRE?`.
- Sin decimal exacto, a propósito: con `number`, como Excel, se dan sus mismos resultados.
- `COINCIDIR` y `BUSCARV` aproximados recorren la lista en vez de hacer la búsqueda binaria de
  Excel: con los datos ordenados (lo que pide Excel) dan lo mismo; desordenados, puede variar.
- `#¡CICLO!` es propio de este motor (Excel avisa la referencia circular y da 0).
- El límite de la notación científica para números chicos (debajo de `1E-9`) falta confirmarlo
  en Excel.

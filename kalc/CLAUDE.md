# Kalc: motor de fórmulas (la librería)

Una **librería TypeScript** que evalúa fórmulas con la misma sintaxis y el mismo comportamiento
que las de una planilla de cálculo (Excel). Esta carpeta tiene solo la librería y su paquete
(`.tgz`): la aplicación para probarla desde el navegador es `kalc-frontend`.

> Nombre: `kalc` (paquete y carpeta). Hasta el 08/10/2026 se llamó `motor-formulas`: la clave
> vieja de `localStorage` se sigue leyendo (`CLAVE_ANTERIOR`).

## Objetivo

1. Evaluar fórmulas tipo Excel: operadores, precedencia, funciones y condicionales (`SI`, `Y`, `O`,
   `SI.ERROR`, …) **dando el mismo resultado que Excel**, incluidos los errores (`#¡DIV/0!`, …).
2. Variables con nombre: cada una es una **constante** (valor tipado) o una **fórmula** que puede
   usar otras variables. El motor resuelve las dependencias, detecta ciclos y recalcula.
3. Persistencia y consultas detrás de interfaces (`RepositorioVariables`, `EjecutorConsultas`): el
   motor no guarda ni corre SQL, lo pone cada aplicación (`kalc-backend` en Oracle, `kalc-frontend`
   en el navegador o por HTTP).

## Las tres partes

Es una de las tres partes de Kalc (`kalc`, `kalc-backend` y `kalc-frontend`), cada una en su
carpeta del repositorio. La arquitectura, cómo se relacionan y cómo instalar y levantar todo
están en el README general, `../README.md`.

Lo de esta carpeta: la librería se consume solo por el `.tgz` (`import … from 'kalc'`).
Al cambiar el motor: versión nueva, `npm run pack` y actualizar el `.tgz` en `kalc-backend` y en
`kalc-frontend`. La base (`.env` con `ORACLE_*`, `db/oracle/*.sql`) es de `kalc-backend`; acá no
hay `.env`.

## Stack

- TypeScript ~6 + Vitest, sin dependencias de ejecución. Node 22.12 o posterior para desarrollar;
  el paquete compila a ES2022 y tiene que andar también en Node 18.
- Instalar con `npm install`.
- Versiones: el número vive en `package.json` (SemVer). Para sacar una: `npm version patch|minor|major`
  (corre tests + typecheck, commit `Versión X` con tag `vX`, push). Después, `npm run pack` y
  actualizar el `.tgz` en `kalc-backend` y `kalc-frontend`.
- Vue, PrimeVue y Vite son de `kalc-frontend` (ver su CLAUDE.md).

## Estructura

Solo `motor/` (14/10/2026: la demo pasó a `kalc-frontend`, la API y `db/` a `kalc-backend`).
`motor/` no importa nada de afuera; las aplicaciones lo usan por su API pública (`motor/index.ts`),
instalando el `.tgz`.

```
motor/                ← LA LIBRERÍA. TypeScript puro: nada de Vue ni DOM
    index.ts          ← API pública (lo único que se exporta; congelada, ver index.test.ts)
    valores.ts        ← tipos de valor, errores, coerciones, formatear
    calendario.ts     ← números de serie de fecha de Excel (con el falso 29/02/1900)
    lexer.ts          ← texto → tokens
    parser.ts         ← tokens → AST (Pratt / precedencia de operadores)
    ast.ts            ← tipos de nodos
    evaluador.ts      ← AST + contexto → Valor
    funciones/        ← registro de funciones, un archivo por familia
      registro.ts     (registrarFuncion/buscarFuncion; registra las familias al cargarse)
      comunes.ts      (conversión de argumentos, redondeo de Excel, SUMA y cía. con referencias)
      formato.ts      (códigos de formato para TEXTO: "#.##0,00", "dd/mm/aaaa")
      logicas.ts      (SI, Y, O, NO, SI.ERROR, SI.CONJUNTO, CAMBIAR, VERDADERO, FALSO)
      matematicas.ts  (SUMA, PROMEDIO, MIN, MAX, REDONDEAR, REDONDEAR.MAS/MENOS, ENTERO, TRUNCAR, ABS, RESIDUO, POTENCIA,
                       RAIZ, EXP, LN, LOG, LOG10, PI, RADIANES, GRADOS, SENO, COS, TAN, ASENO, ACOS,
                       ATAN, ATAN2 e hiperbólicas)
      texto.ts        (CONCAT, IZQUIERDA, DERECHA, EXTRAE, LARGO, MAYUSC, MINUSC, ESPACIOS, TEXTO, VALOR,
                       HALLAR, ENCONTRAR, CONTIENE: propia de Kalc, `propia: true`)
      fechas.ts       (HOY, FECHA, AÑO, MES, DIA, DIAS, FIN.MES, FECHA.MES)
      informacion.ts  (ESNUMERO, ESTEXTO, ESBLANCO, ESERROR)
      estadisticas.ts (CONTAR, CONTARA, CONTAR.BLANCO, CONTAR.SI[.CONJUNTO], SUMAR.SI[.CONJUNTO], PROMEDIO.SI)
      busqueda.ts     (BUSCARV, BUSCARX, COINCIDIR, INDICE, FILAS, COLUMNAS)
      criterios.ts    (criterios de los .SI: ">100", "L*", "<>"; búsqueda exacta/aproximada)
      ejemplos.ts     (CONTEXTO_EJEMPLOS: la tabla Causas de los ejemplos del registro)
      matrices.ts     (FILTRAR, ORDENAR, UNICOS, ELEGIRCOLS, TOMAR: devuelven tablas con `evaluarRango`)
    variables.ts      ← catálogo de variables, grafo de dependencias, orden de cálculo, ciclos
    consultas.ts      ← variables de consulta: parámetros `:Nombre` del SQL, EjecutorConsultas (el motor no corre SQL)
    tablas.ts         ← Tabla y Rango: `Ventas[Importe]`; no es un Valor. Nombres de columna de un rango
                        (WeakMap, para no cambiar Rango), leerDatos/escribirDatos (tablas a mano)
    repositorio.ts    ← interfaz RepositorioVariables (la implementan kalc-frontend y kalc-backend)
    *.test.ts         ← tests al lado del código
scripts/probar-lib.mjs ← prueba dist-lib/ en Node puro; la corre build:lib
scripts/generar-funciones.mjs ← docs/funciones.md desde el registro (no editarlo a mano); la corre build:lib
scripts/fechar-changelog.mjs  ← "Sin publicar" del CHANGELOG pasa a la versión nueva; la corre npm version
CHANGELOG.md          ← lo que cambia en cada versión: anotar en "Sin publicar" con cada Feat/Fix del motor
```

`kalc-backend` tiene que poder correr el motor en un servidor con Node 18: por eso
`tsconfig.lib.json` tiene `lib: ES2022`, y el motor no puede usar nada que Node 18 no tenga
(`toSorted`, `Object.groupBy`…).

La librería se compila aparte con `tsconfig.lib.json` (`include: motor/**/*.ts`, sin tests) a
`dist-lib/`, con `exports` en `package.json` apuntando a `dist-lib/index.js` + `index.d.ts`.
`npm run pack` (`npm pack` con `prepack` → `build:lib`) arma el `.tgz` en `packs/`
para instalar en otra aplicación; desde git no se puede porque `dist-lib/` no se versiona. Imports con extensión `.ts`
(`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`) para poder correr la lógica en
Node sin compilar.

tsconfig estricto: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`. `tsconfig.json` extiende `tsconfig.lib.json` con los tests y los tipos de
Node: es el del typecheck.

## Diseño del motor

### Tipos de valor (sí, hay que manejarlos)

Excel tiene tipos aunque no se vean, y para dar los mismos resultados hay que modelarlos:

```ts
type Valor =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'texto'; valor: string }
  | { tipo: 'logico'; valor: boolean }
  | { tipo: 'fecha'; valor: number }        // número de serie de Excel (días desde 1899-12-30)
  | { tipo: 'error'; valor: CodigoError }
  | { tipo: 'vacio' }

type CodigoError = '#¡DIV/0!' | '#¡VALOR!' | '#¿NOMBRE?' | '#¡REF!' | '#N/D' | '#¡NUM!' | '#¡CICLO!'
```

- **Fecha**: en Excel es un número con formato. Acá es un tipo propio (para mostrarla y validarla)
  pero opera como su número de serie: `fecha + 1` es el día siguiente, `fecha2 - fecha1` da días.
  Respetar la convención de Excel (serie 1 = 01/01/1900, incluido el falso 29/02/1900) para que
  los números coincidan.
- **Entero vs real**: en Excel no existe la distinción; es todo `numero` (double). En las
  **variables** sí se puede declarar `entero` como restricción de validación (el valor guardado
  sigue siendo `numero`).
- **Vacío**: una variable sin valor vale `0` en aritmética y `""` en texto, como una celda vacía.
- Precisión: Excel muestra 15 dígitos significativos (`0,1 + 0,2 = 0,3` en pantalla). Redondear a
  15 dígitos al mostrar y al comparar igualdad. **Decidido (07/10/2026)**: `number` como Excel, sin
  decimal exacto, para dar sus mismos resultados; cambiarlo rompería la API (versión major).

### Sintaxis (configuración regional es-AR, como Excel en castellano)

- Separador de argumentos `;`, separador decimal `,` → `SI(A>1,5; "alto"; "bajo")`.
- Nombres de funciones en castellano (`SI`, `SUMA`, `Y`). El registro guarda también el nombre
  en inglés como alias (`IF`, `SUM`, `AND`) para aceptar ambos y poder exportar.
- Funciones propias de Kalc (sin equivalente en Excel, decisión del 16/10/2026): se permiten, con
  `propia: true` en el registro (el catálogo y `docs/funciones.md` las marcan), sin alias en inglés
  y con la forma de Excel en la descripción. La primera es `CONTIENE` = `ESNUMERO(HALLAR(…))`.
- Sin `=` inicial: no hace falta (la variable ya dice si es fórmula o constante) y la UI no lo
  muestra; se acepta igual para poder pegar fórmulas de Excel. Mayúsculas/minúsculas indistintas en funciones y variables.
- Literales: números, `"texto"` (comillas dobles se escapan duplicadas: `"dijo ""hola"""`),
  `VERDADERO` / `FALSO`, errores literales (`#N/D`).
- Variables: identificadores (`Alicuota`, `base_imponible`). Para nombres con espacios o
  acentos raros, `[Base imponible]`. No usar nombres que parezcan referencias de celda (`A1`).

### Operadores y precedencia (de mayor a menor, como Excel)

| Orden | Operador | Notas |
|---|---|---|
| 1 | `-` unario | **Antes que `^`**: `-2^2 = 4` en Excel (no -4). Testearlo. |
| 2 | `%` | sufijo: `50% = 0,5` |
| 3 | `^` | asociativo a izquierda en Excel: `2^3^2 = 64` |
| 4 | `*` `/` | |
| 5 | `+` `-` | |
| 6 | `&` | concatenación |
| 7 | `=` `<>` `<` `>` `<=` `>=` | |

### Reglas de Excel que hay que respetar (y testear una por una)

- Coerción en aritmética: `"3" + 1 = 4`, `VERDADERO + 1 = 2`, `"abc" + 1 = #¡VALOR!`.
- Comparación: texto sin distinguir mayúsculas (`"a" = "A"` → VERDADERO); entre tipos distintos
  el orden es número < texto < lógico (`"1" > 99999` → VERDADERO, sin coerción).
- `SI`, `SI.ERROR`, `SI.CONJUNTO` y `CAMBIAR` **evalúan con cortocircuito**:
  `SI(VERDADERO; 1; 1/0)` da 1. El evaluador pasa a las funciones los argumentos **sin evaluar**
  (thunks) y cada función decide. **`Y` y `O` no**: en Excel evalúan todo, `Y(FALSO; 1/0)` da
  `#¡DIV/0!`.
- Una variable sola como argumento se comporta como una **referencia a celda** (el thunk lleva
  `referencia: true`): `SUMA(A)` con A = `"3"` la ignora, `SUMA("3")` suma 3. Igual en
  `PROMEDIO`, `MIN`, `MAX`, `Y`, `O`.
- Los errores se propagan: cualquier operación con un error devuelve ese error (el primero, en
  orden de evaluación).
- `SI` con un solo resultado y condición falsa devuelve `FALSO`.
- `REDONDEAR` redondea "hacia afuera" en el 5 (`REDONDEAR(2,5;0) = 3`, `REDONDEAR(-2,5;0) = -3`),
  no el redondeo bancario de JavaScript. Ojo con `Math.round`.
- Nombre de función o variable inexistente → `#¿NOMBRE?`.

### Variables y dependencias

```ts
interface Variable {
  nombre: string
  tipo: 'numero' | 'entero' | 'texto' | 'logico' | 'fecha' | 'tabla'   // tipo esperado del resultado
  origen:
    | { clase: 'constante'; valor: Valor }
    | { clase: 'formula'; texto: string }
    | { clase: 'consulta'; sql: string; conexion?: string }   // SELECT con parámetros :Nombre; de tipo tabla trae todas las filas; conexion: en qué base (1.5.0)
    | { clase: 'datos'; tabla: Tabla }     // de tipo tabla: escrita a mano
  columnas?: ColumnaCalculada[]            // de tipo tabla: { nombre, formula } con [@Columna]
  descripcion?: string
}
```

- Tipo `tabla`: de una consulta, de una fórmula (`FILTRAR(…)`: arrays dinámicos, ver abajo) o de
  `{ clase: 'datos'; tabla }` (escrita a mano). Puede tener `columnas?: { nombre, formula }[]`,
  calculadas fila por fila con `[@Columna]` (contexto `fila`); usan su propia tabla sin ciclo (la
  propia no es dependencia). En Oracle van en la columna `COLUMNAS` (JSON).
- Arrays dinámicos (evaluador): una operación con una tabla o columna va celda por celda
  (`esDeRango` lo decide por la forma del árbol; `evaluarMatriz` da el rango); como argumento, el
  `Argumento` trae `rango()`; como valor suelto, `valorDeRango` (#¡VALOR! si hay varias celdas);
  `evaluarComoTabla` la devuelve entera. Las funciones marcadas `porCelda` (texto menos CONCAT,
  información, AÑO/MES/DIA) con un argumento que es rango también van celda por celda (`esPorCelda`,
  `entreVarios`); las demás funciones de un valor (SI, REDONDEAR…) todavía no.
- Las consultas las corre un `EjecutorConsultas` que da la aplicación (`resolverConsultas`):
  mientras tanto valen `#N/D` (problema `pendiente`). Una de tipo `tabla` deja la `Tabla` en el
  estado y las fórmulas la leen como `Expedientes[Estado]` o `Expedientes`; usada como valor
  suelto da `#¡VALOR!` (salvo una sola celda).

- Al cargar o editar una fórmula se parsea una vez y se extraen sus dependencias (las variables
  que nombra) → grafo dirigido.
- Orden de cálculo topológico; **ciclos** → todas las variables del ciclo valen `#¡CICLO!` y la
  UI muestra el camino (`A → B → C → A`).
- Al cambiar una variable se recalculan solo las que dependen de ella (transitivamente).
- Si el resultado no coincide con el tipo declarado → error de validación visible en la tabla
  (no se convierte en silencio).

### API pública (congelada desde la 1.0.0)

```ts
evaluar(formula: string, contexto?: Contexto): Valor   // lanza ErrorSintaxis si no se puede leer
parsear(formula: string): ResultadoParseo              // árbol o error de sintaxis con posición
crearCatalogo(variables?: Variable[]): Catalogo        // estado, definir, quitar, renombrar, recalcular, contexto
formatear(valor: Valor): string                        // "1234,56" (General), "31/12/2026", "#¡DIV/0!"
registrarFuncion(def: DefinicionFuncion): void         // funciones propias del negocio
```

Más los constructores de valores (`numero`, `texto`, `logico`, `fecha`, `error`, `VACIO`) y los
ayudantes para funciones propias (`argNumero`, `argEntero`, `argTexto`, `aLogico`). La lista
completa está en el README. `motor/index.test.ts` lista lo exportado: agregar algo es una
versión minor; sacar, renombrar o cambiar una firma, major. Los errores de sintaxis devuelven
**posición** (inicio/fin) para poder subrayar en la UI.

## Demo

Está en `kalc-frontend` (Probador, Variables, Funciones, Ayuda): ver su CLAUDE.md. Lo que el motor
le da para eso: `listarFunciones` y `CONTEXTO_EJEMPLOS` (el catálogo de Funciones), `hijos` y las
posiciones de los nodos (el árbol del Probador), `leerDatos`/`escribirDatos` (tablas a mano).

## Tests

- Vitest, sin configuración: `motor/**/*.test.ts` (los de la API están en `kalc-backend` y los de pantallas en `kalc-frontend`).
- Tests **en tabla** por función/regla: `[fórmula, resultado esperado]`, con los resultados
  **según el comportamiento documentado de Excel 365** (no se confirman en un Excel real: el
  destino es una aplicación web, decidido el 13/10/2026). Un archivo
  `motor/casos-excel.test.ts` con los casos raros: `-2^2`, `2^3^2`, `"1">99999`,
  `REDONDEAR(-2,5;0)`, `0,1+0,2=0,3`, fecha 29/02/1900, cortocircuito de `SI`.
- Nada de lógica nueva sin test.

## Plan por etapas

Hechas las etapas 1 a 5 (07/10/2026). De la 6, la persistencia en Oracle y las variables de consulta (08/10/2026, versión 1.1.0)
y las consultas de tipo tabla (08/10/2026, versión 1.2.0). Después de la 1.2.0 (09/10/2026, sin
versión nueva todavía): modo thick opcional de Oracle, ejemplos con consultas, la API sin caché y
la tabla de ejemplo `Causas`. Después (09/10/2026): arrays dinámicos, tablas a mano (clase Datos)
y columnas calculadas con `[@Columna]` (para la 1.3.0, con la migración `variables-1.3.0.sql`).

1. **Esqueleto**: proyecto Vite + Vue andando en 7200, tsconfig app/lib/node, Vitest, `.npmrc`,
   `.gitignore`, página vacía con las cuatro solapas.
2. **Núcleo**: `valores` + `lexer` + `parser` + `evaluador` con aritmética, `&`, comparaciones,
   precedencia y errores. Probador funcionando (sin variables).
3. **Funciones**: lógicas (con cortocircuito) → matemáticas → texto → información → fechas.
   Catálogo en la demo.
4. **Variables**: catálogo, grafo, ciclos, recálculo incremental, validación de tipos. Página
   Variables con `localStorage`.
5. **Librería**: `build:lib`, API pública congelada, README con ejemplos de uso.
6. **Después**: ~~persistencia en base~~ (hecha: hoy en `kalc-backend`), ~~variables de consulta~~ (hechas: un `SELECT` de un valor, con parámetros `:Nombre`; o de tipo
   tabla, todas las filas, usadas como `Ventas[Importe]` en SUMA, SUMAR.SI, BUSCARV…; después
   ~~`[@Columna]`, arrays dinámicos y tablas que no salgan de una consulta~~ (hechos), funciones de negocio propias (alícuotas, topes),
   exportar a Excel.

## Decisiones tomadas

- **Decimal exacto: descartado (09/10/2026).** Va contra el objetivo (dar los mismos resultados que
  Excel, que calcula con doble precisión) y cambiaría la API (major). Para importes, `REDONDEAR`.

## Decisiones abiertas

- ¿Hace falta soportar rangos/arrays (`SUMA(A1:A10)`)? No hay celdas: los rangos son las tablas de
  las consultas (`Tabla` no es un `Valor`: las funciones la leen por `Argumento.rango`). Si hacen
  falta listas de variables, irían por el mismo camino.
- Resuelto: las funciones volátiles (`HOY`) llevan `volatil: true` en el registro; el catálogo las
  recalcula con `recalcular()` (botón Recalcular en `kalc-frontend`), no solas.

## Estilo

- Responder en español rioplatense. Nombres de dominio en español (`evaluar`, `Variable`,
  `CodigoError`); nombres técnicos genéricos en inglés solo si no hay uno claro en castellano.
- Comentarios cortos que expliquen el **por qué** (sobre todo cada regla rara de Excel).
- Commits en español: `Feat: <Área>: <qué>` / `Fix: …` / `Test: …`.

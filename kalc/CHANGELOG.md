# Historial de cambios

Lo que cambia en la librería de una versión a la otra, para quien actualiza el `.tgz` en
`kalc-backend` o `kalc-frontend`. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y las versiones, [SemVer](https://semver.org/lang/es/) (ver "Versiones" en el [README](README.md)).
La referencia de las funciones está en [docs/funciones.md](docs/funciones.md).

Lo nuevo se anota en **Sin publicar** a medida que se hace; `npm version` le pone el número y la fecha.

## Sin publicar

### Cambiado

- El `.tgz` lleva también este CHANGELOG y `docs/funciones.md` (antes, solo `dist-lib/`).

## [1.7.0] - 2026-10-16

### Agregado

- `CONTIENE(texto; texto_buscado)`: VERDADERO si el texto contiene el buscado, sin distinguir
  mayúsculas y con comodines, como `HALLAR`. Es la primera función **propia de Kalc**: no existe
  en Excel, donde se escribe `ESNUMERO(HALLAR(texto_buscado; texto))`. Va celda por celda con una
  columna: `FILTRAR(Causas; CONTIENE(Causas[Causa]; "ez"))`.
- `DefinicionFuncion` tiene el campo opcional `propia`, para las funciones que no existen en Excel:
  la referencia de funciones (`docs/funciones.md`) y el catálogo las marcan.

### Corregido

- README, "Diferencias conocidas con Excel": decía que las funciones de un valor no van celda por
  celda, y desde la 1.6.0 las de texto, de información y `AÑO`, `MES` y `DIA` sí.

## [1.6.0] - 2026-10-16

### Agregado

- Este historial de cambios y la referencia de las funciones, `docs/funciones.md`, que
  `npm run build:lib` genera desde el registro con el resultado de cada ejemplo.
- `HALLAR` (`SEARCH`) y `ENCONTRAR` (`FIND`): la posición de un texto dentro de otro. `HALLAR` no
  distingue mayúsculas y acepta comodines (`*`, `?`, `~`); `ENCONTRAR` distingue y busca tal cual.
  `ESNUMERO(HALLAR("pérez"; Causas[Causa]))` es la condición "contiene".
- Funciones de un valor con un rango, como en Excel 365: las de texto (menos `CONCAT`), las de
  información (`ESNUMERO`…) y `AÑO`, `MES` y `DIA`, si reciben una columna o una tabla donde
  esperan un valor, se aplican celda por celda y dan un rango. Sirven como condición de `FILTRAR` y
  como argumento de `SUMA`, `CONTAR.SI`, etc. `DefinicionFuncion` tiene el campo opcional
  `porCelda`, para que una función propia haga lo mismo.

### Cambiado

- Una de esas funciones con un rango de varias celdas, como valor suelto, da `#¡VALOR!` (como
  Excel fuera de un array dinámico). Antes recibía el `#¡VALOR!` del rango como argumento:
  `ESNUMERO(Causas[Monto])` daba FALSO y `ESERROR(Causas[Monto])`, VERDADERO.

## [1.5.1] - 2026-10-15

### Corregido

- Consultas: `x::int` (una conversión de PostgreSQL) ya no se toma como el parámetro `:int`.

## [1.5.0] - 2026-10-15

### Agregado

- Consultas: conexión opcional en el origen de una consulta (`{ clase: 'consulta', sql, conexion }`),
  para las aplicaciones con varias bases. El `EjecutorConsultas` la recibe en la `Consulta`; cambiarla
  obliga a correr la consulta de nuevo y renombrar un parámetro la conserva.
- `npm run pack` deja el paquete en `packs/`.

### Cambiado

- El repositorio queda solo con el motor y su paquete: la aplicación pasa a `kalc-frontend` y la API
  y los scripts de la base, a `kalc-backend`. La librería no cambia.

## [1.4.0] - 2026-10-13

### Agregado

- API: `codigoSql`, el SQL sin textos, identificadores entre comillas ni comentarios (para buscar en
  el código de la consulta sin falsos positivos).
- API: el tipo `RepositorioVariables`, la interfaz para guardar las variables que implementa cada
  aplicación.

### Cambiado

- El motor pasa de `src/motor/` a `motor/`, y lo demás a `frontend/`, `backend/` y `db/`.
- Los resultados esperados de los tests siguen el comportamiento documentado de Excel 365; se quitan
  los casos pendientes de confirmar contra un Excel real.

## [1.3.0] - 2026-10-09

### Agregado

- Arrays dinámicos, como Excel 365: una operación con una tabla o una columna va celda por celda.
  Una variable de tipo tabla puede ser una fórmula; `evaluarComoTabla` la devuelve entera.
- Funciones de matrices, que devuelven tablas: `FILTRAR`, `ORDENAR`, `UNICOS`, `ELEGIRCOLS` y `TOMAR`.
- Tablas a mano: el origen `datos`, escrito con `;` o pegado desde Excel (`leerDatos`, `escribirDatos`).
- Columnas calculadas: fórmulas por fila con `[@Columna]`, que pueden usar otras variables y la misma
  tabla sin ciclo (`ColumnaCalculada`).
- `CONTEXTO_EJEMPLOS`: la tabla Causas con la que se evalúan los ejemplos de las funciones.

## [1.2.0] - 2026-10-08

### Agregado

- Variables de tipo tabla: una consulta que trae filas se usa como una tabla de Excel: `Ventas` es la
  tabla y `Ventas[Importe]`, una columna (`esTabla`, `Tabla`, `Rango`).
- `SUMA`, `PROMEDIO`, `MIN`, `MAX`, `Y` y `O` sobre columnas.
- Funciones de conteo y búsqueda, con los criterios de Excel (`">100"`, `"L*"`): `CONTAR`, `CONTARA`,
  `CONTAR.BLANCO`, `CONTAR.SI`, `CONTAR.SI.CONJUNTO`, `SUMAR.SI`, `SUMAR.SI.CONJUNTO`, `PROMEDIO.SI`,
  `BUSCARV`, `BUSCARX`, `COINCIDIR`, `INDICE`, `FILAS` y `COLUMNAS`.

## [1.1.0] - 2026-10-08

### Agregado

- Variables de consulta: un `SELECT` con parámetros `:Nombre`, que son otras variables. El motor no
  corre SQL: lo hace el `EjecutorConsultas` de cada aplicación (`parametrosConsulta`,
  `sirveComoParametro`, `ErrorConsulta`, `Consulta`, `ParametroConsulta`).
- Funciones: logaritmos, exponencial, raíz y trigonométricas (`LN`, `LOG`, `LOG10`, `EXP`, `RAIZ`,
  `PI`, `SENO`, `COS`, `TAN` y las inversas e hiperbólicas, `RADIANES`, `GRADOS`).

### Cambiado

- El proyecto pasa a llamarse `kalc` (antes `motor-formulas`).

## [1.0.0] - 2026-10-07

Primera versión con la API pública congelada (`motor/index.ts`): desde acá, sacar o cambiar algo
exportado sube la versión major.

### Agregado

- Funciones lógicas, matemáticas, de texto, de información y de fechas, con sus nombres en castellano
  y en inglés, y `registrarFuncion` para las propias.
- Catálogo de variables (`crearCatalogo`): constantes y fórmulas, con dependencias, detección de
  ciclos y recálculo incremental.
- Números en formato General, sin separador de miles (`formatear`).
- Paquete instalable con `npm pack`.

## [0.1.0] - 2026-10-07

### Agregado

- Lexer, parser y evaluador con las reglas de Excel: operadores, precedencia, tipos y errores.

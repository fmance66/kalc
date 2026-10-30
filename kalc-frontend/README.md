# kalc-frontend

La aplicación de [Kalc](../kalc) en el navegador, en Vue 3 + PrimeVue: un **probador de fórmulas**
con el árbol de cada fórmula, una **tabla de variables** editable (constantes, fórmulas, tablas
escritas a mano y consultas a PostgreSQL u Oracle), el **catálogo de funciones** y una **ayuda** con ejemplos que
se prueban con un clic. Las variables se guardan en la base a través de
[kalc-backend](../kalc-backend), o, sin backend, en el `localStorage` del navegador.

Usa Kalc como librería, instalada desde el `.tgz` (`paquetes/`): todo lo que importa sale de
`'kalc'` (`crearCatalogo`, `evaluarComoTabla`, `parsear`, `listarFunciones`…), nunca de sus
archivos.

Es una de las tres partes de Kalc (`kalc`, `kalc-backend` y `kalc-frontend`), cada una en su
carpeta de este repositorio. La arquitectura, cómo se relacionan y cómo instalar y levantar todo
están en el [README general](../README.md).

## Uso

Requiere Node 22.12 o posterior.

```sh
npm install
cp .env.example .env  # VITE_API=/api: las variables y las consultas van a kalc-backend
npm start             # kalc-backend (7201) y la app en http://localhost:7200 (npm run dev es lo mismo)
npm run dev:app       # solo la app, sin levantar kalc-backend
npm test              # Vitest: lógica y pantallas (happy-dom)
npm run typecheck
npm run build         # dist/, con rutas relativas
npm run publicar      # a un servidor Windows con IIS (ver Despliegue)
```

`npm start` levanta `kalc-backend` desde `../kalc-backend` (o desde la carpeta de
`KALC_BACKEND_DIR`) y Vite le reenvía `/api`. Si ya está corriendo en el 7201, usa ese. Si no está,
la app arranca igual y avisa que no pudo cargar las variables, con un botón para reintentar.

La app usa `kalc-backend` solo si el `.env` tiene `VITE_API=/api`. Sin esa línea, guarda las
variables en el navegador (clave `kalc:variables`) y no puede correr las consultas. Vite lee el
`.env` al arrancar: después de cambiarlo, hay que reiniciarlo.

El enlace al repositorio del pie y de la Ayuda sale de `repository` en `package.json`: sin ese
campo, no aparece.

## Qué se puede hacer

Las solapas siguen el orden de uso: **Probador · Variables · Funciones · Ayuda**, y la app abre en
Probador.

- **Probador**: se escribe una fórmula y se calcula con Enter, con su tipo. Un error de sintaxis se
  subraya donde está y explica qué falta. Abajo se ve el **árbol de la fórmula** con el valor de
  cada parte; al pasar el puntero por un nodo se marca su tramo en la fórmula, y así se ven las
  precedencias (`-2^2` es `(-2)^2`). Los botones de ejemplo prueban los casos raros con un clic;
  los que usan consultas al juzgado de ejemplo aparecen si esas variables están cargadas. Un clic
  en una variable la agrega a la fórmula.
- **Variables**: tabla editable con nombre, descripción, tipo, constante, fórmula, consulta a la
  base o datos escritos a mano, resultado y estado (OK, error de sintaxis, variable que no existe,
  ciclo con su camino, tipo que no coincide, consulta pendiente o con error). Una de tipo Tabla
  muestra el tamaño ("367 filas × 4 columnas") y, con un clic, las primeras filas. Arriba, una
  búsqueda filtra por nombre, descripción o fórmula; los títulos Nombre y Tipo ordenan la tabla
  (un clic ordena, otro invierte, otro vuelve al orden guardado), y el pie dice cuántas son. Al
  cambiar una se recalculan al instante las que dependen de ella, y se resaltan; el botón de cada
  fila la recalcula sola (a una consulta, la vuelve a correr). Renombrar corrige las fórmulas que
  la usan. Se exportan e importan en JSON.
- **Funciones**: el catálogo, generado desde el registro de Kalc y agrupado por familia, con
  nombre, alias en inglés, firma, descripción y un ejemplo calculado en vivo. Se puede buscar (sin
  importar acentos: "ano" encuentra `AÑO`) y un clic en el ejemplo lo abre en el Probador.
- **Ayuda**: sintaxis, operadores, tipos de valor, consultas, tablas, errores, reglas de Excel que
  sorprenden y diferencias con Excel; los ejemplos se abren en el Probador. Si kalc-backend tiene
  la conexión `local` (PostgreSQL), también los ejemplos con PostgreSQL.

Si al arrancar no hay ninguna variable guardada, la app pregunta si cargar las de ejemplo
(`src/pruebas/variablesIniciales.ts`). En `ejemplos/` hay variables exportadas para importar desde
la solapa Variables: `variablesIniciales.json` (las mismas, se regenera al cambiarlas) y
`variablesOtras.json`.

## Las variables, en la base

Con `VITE_API`, la app lee las variables de kalc-backend al arrancar (`GET /api/variables`) y
guarda ahí cada cambio: de a una variable (`PUT` o `DELETE /api/variables/:nombre`). Al renombrar,
guarda solo las que cambiaron (la renombrada y las fórmulas que la usaban), sin reemplazar la
lista entera, para no pisar lo que otro haya cambiado mientras tanto. Importar un JSON o cargar las
de ejemplo sí reemplaza todas (`PUT /api/variables`), después de confirmarlo.

Si kalc-backend falla, el cambio queda en pantalla y un aviso arriba lo dice, con **Reintentar**:
después de un guardado fallido guarda todas las de pantalla; después de una carga fallida vuelve a
cargar (nunca guarda: reemplazaría las de la base por una lista incompleta).

La conexión a la base es la de kalc-backend (`../kalc-backend/.env`, ver su README): este proyecto
no tiene credenciales. Puede tener varias bases con nombre: una guarda las variables y las
consultas corren en las que diga su `CONSULTAS`.

## Consultas a la base

Una variable de **Consulta** tiene un `SELECT`. De un valor (Número, Texto…) toma la única celda
del resultado; de tipo **Tabla**, todas las filas, que las fórmulas usan como una tabla de Excel:
`FILAS(Expedientes)`, `CONTAR.SI(Expedientes[Estado]; 2)`. `:Nombre` usa otra variable como
parámetro: `select descripcion from fueros where codigo = :Fuero`. Mientras la consulta corre,
la variable vale `#N/D` ("Consulta pendiente").

**kalc-backend corre el SQL que tiene guardado, nunca el que manda el navegador.** Por eso, al
agregar o cambiar una variable de consulta, la app primero la guarda y después le pide correrla
(`POST /api/consultas/:nombre`, con los parámetros). kalc-backend controla que sea un solo
`SELECT` y lo corre en una transacción de solo lectura, con un máximo de 15 segundos y 10.000
filas.

**En qué base corre.** Si kalc-backend tiene más de una conexión para consultas
(`GET /api/conexiones`, que la app lee al arrancar: `src/conexiones.ts`), la fila de una consulta
muestra el desplegable **Conexión**: "Por defecto" (la primera del servidor) o una por nombre, que
se guarda en la variable (`origen.conexion`, Kalc 1.5.0). Con una sola, no aparece. Una variable
con una conexión que el servidor no tiene (importada de otro) la muestra como "no está en el
servidor" y su consulta da `#¡VALOR!` con el motivo.

Las consultas corren en PostgreSQL o, si kalc-backend tiene una conexión Oracle (ver "Consultas en
Oracle" en su README), en Oracle; el SQL se escribe igual, con `:Nombre`. En la base, las columnas
se llaman como las devuelve (PostgreSQL en minúscula, Oracle en mayúscula, salvo un alias entre
comillas), y en las fórmulas da igual: `Expedientes[Estado]`. Dos columnas con el mismo nombre
(`select a.id, b.id`) necesitan alias distintos.

### Ejemplos con el juzgado

Las variables de ejemplo traen estas consultas, contra el juzgado de ejemplo: el esquema `kalc_data`
de la base PostgreSQL de kalc-backend (`db/postgres/kalc_data.sql`, datos inventados). Para que
corran, kalc-backend tiene que tener esa base como conexión de consultas por defecto (ver "La base
de ejemplo" en su README). La solapa Ayuda las muestra con fórmulas para probar con un clic.

| Variable | Tipo | SQL | Fórmula de ejemplo | Da |
|---|---|---|---|---|
| `Nombre del fuero` | texto | `select descripcion from fueros where codigo = :Fuero` | `"Fuero " & [Nombre del fuero]` | Fuero Federal |
| `Expedientes vigentes` | entero | `select count(*) from expedientes where baja is null` | `SI([Expedientes vigentes] > 300; "Muchos"; "Pocos")` | Muchos |
| `Expedientes` | tabla | `select id, estado, region, alta from expedientes where baja is null order by id` | `CONTAR.SI(Expedientes[Estado]; 2)` | 229 |
| | | | `MAX(Expedientes[Alta])` | la fecha en que se cargó la base, o poco antes |
| `Estados` | tabla | `select codigo, nombre from estados order by codigo` | `BUSCARV(2; Estados; 2; FALSO)` | En trámite |
| `Jurisdicciones` | tabla con parámetro | `select codigo, descripcion from jurisdicciones where fuero = :Fuero and baja is null order by descripcion` | `FILAS(Jurisdicciones)` | 9 |
| `Expedientes por estado` | tabla agrupada | `select estado, count(*) as cantidad from expedientes where baja is null group by estado order by estado` | `BUSCARV(2; [Expedientes por estado]; 2; FALSO)` | 229 |
| `Expedientes por región` | tabla con join | `select r.descripcion as region, count(*) as cantidad from expedientes e join regiones r on r.codigo = e.region where e.baja is null group by r.descripcion order by cantidad desc` | `INDICE([Expedientes por región][Region]; 1)` | Metropolitana |
| `Expedientes con estado` | tabla con join | `select e.id, t.nombre as estado, e.alta from expedientes e join estados t on t.codigo = e.estado where e.baja is null order by e.id` | `CONTAR.SI([Expedientes con estado][Estado]; "En tr*")` | 229 |

Con varias filas, mejor agrupar o filtrar en el SQL (`group by`, `where`) que traer todo y contar
con fórmulas: viaja menos y el tope es 10.000 filas. Las columnas se usan con el nombre del alias
(`count(*) as cantidad` → `[Expedientes por estado][Cantidad]`).

### Ejemplos con PostgreSQL

Si kalc-backend tiene la conexión `local` (la base PostgreSQL de ejemplo: ver "La base de ejemplo"
en su README), la Ayuda muestra además "Ejemplos con PostgreSQL": 28 variables de
`src/pruebas/variablesPostgres.ts`, con esa conexión elegida, sobre los esquemas `prueba`, `hr` y
`scott`. No están en las variables iniciales: sin esa conexión la sección no aparece. Si faltan en
Variables, el botón **Agregarlas** agrega las que no están y no toca las demás. Los datos son fijos,
así que dan siempre lo mismo:

| Variable | Tipo | Fórmula de ejemplo | Da |
|---|---|---|---|
| `Alícuota IIBB` | número, con `:Actividad` | `Neto * [Alícuota IIBB]` | 35 |
| `Actividades` | tabla, con una columna `boolean` | `CONTAR.SI(Actividades[Exenta]; VERDADERO)` | 3 |
| `Escala` | tabla por tramos | `[Impuesto según escala]` (BUSCARV aproximado) | 200000 |
| `Cotización` | número, con `:Moneda` y `:Día` | `REDONDEAR(Total / Cotización; 2)` | 0,68 |
| `Ventas por sucursal` | tabla agrupada | `INDICE([Ventas por sucursal][Sucursal]; 1)` | Belgrano |
| `Empleados` (hr) | tabla | `PROMEDIO.SI(Empleados[Departamento]; 60; Empleados[Sueldo])` | 5760 |
| `Antigüedad promedio` (hr) | número, con `::` | `ENTERO([Antigüedad promedio])` | 20 |
| `Grados salariales` (scott) | tabla | `BUSCARV(1250; [Grados salariales]; 3; VERDADERO)` | 2 |

## Despliegue

Los scripts publican en un servidor Windows con IIS, como archivos estáticos en la carpeta `kalc`
del IIS. Su `web.config` (`public/web.config`, que va con el build) reenvía `/kalc/api/` a
`kalc-backend`, que corre en el mismo servidor en el puerto 8082 y se publica aparte, desde su
carpeta (ver su README). El build se hace en la PC de desarrollo, con Node 22.12 o posterior.

| Variable | Qué es | Ejemplo |
|---|---|---|
| `KALC_DESTINO` | la carpeta del IIS, compartida (obligatoria) | `\\servidor\c\inetpub\wwwroot\kalc` |
| `KALC_BASE` | la subcarpeta del sitio | `/kalc/` (la de por defecto) |
| `KALC_URL` | opcional: la dirección que se muestra al terminar | `http://servidor/kalc/` |

1. Conectarse a la carpeta compartida del servidor (`robocopy` no pide credenciales). El `*` pide
   la contraseña; la conexión dura hasta cerrar la sesión de Windows:

   ```powershell
   net use \\servidor\c /user:servidor\<usuario> *
   ```

   Si responde `error 1219`, borrar la conexión anterior con `net use \\servidor\c /delete`.

2. Publicar, desde PowerShell o cmd (Git Bash convierte `\\` en `\` y el destino queda mal):

   ```powershell
   $env:KALC_DESTINO = '\\servidor\c\inetpub\wwwroot\kalc'
   npm run publicar           # o npm run publicar:prueba: compila y muestra qué copiaría
   ```

   `scripts/publicar.mjs` compila con base `/kalc/` (o `KALC_BASE`) y `VITE_API=/kalc/api` y copia
   `dist/` con `robocopy /MIR` a `KALC_DESTINO`. No hace falta reiniciar nada: `index.html` va sin
   caché y los `assets/` llevan un hash en el nombre. El pie muestra la versión, el commit y la
   fecha del build (`+cambios` si se compiló con cambios sin commitear), para saber qué quedó
   publicado, y al lado la de kalc-backend, que lee de `GET /api/version` (si no responde, solo la
   de la app).

3. La primera vez, en el servidor, verificar que el IIS llegue a la API: `servicio.ps1 -Accion
   iis` de `kalc-backend` (controla URL Rewrite y ARR y pide `http://localhost/kalc/api/variables`).
   Si `kalc-backend` escucha en otro puerto, cambiarlo en `public/web.config`.

## Versiones

El número está en `package.json` (SemVer). Para sacar una, con todo commiteado: `npm version
patch` (o `minor` / `major`). Corre los tests y el chequeo de tipos, hace el commit `Versión X` con
el tag `vX` y sube los dos al remoto. El pie muestra `vX`.

## Pasar a otra versión de Kalc

El paquete está commiteado en `paquetes/`, para que `npm install` ande en cualquier máquina:

```sh
# en kalc
npm run pack                                   # → packs/kalc-X.Y.Z.tgz

# acá
cp ../kalc/packs/kalc-X.Y.Z.tgz paquetes/
npm install ./paquetes/kalc-X.Y.Z.tgz          # actualiza package.json
rm paquetes/kalc-<la anterior>.tgz
```

Con una versión nueva de Kalc, conviene actualizarla también en kalc-backend: el formato de las
variables sale de ahí.

## Archivos

```
src/
  main.ts             carga las variables y monta la app (PrimeVue con el tema Aura, PrimeIcons y estilos)
  App.vue             encabezado, solapas, aviso de errores de guardado, pie con la versión (la de la app y la de la API)
  catalogo.ts         el catálogo de Kalc (shallowRef + triggerRef: no es reactivo), compartido por
                      Probador y Variables; guarda cada cambio en el repositorio
  tipos.ts            los tipos de variable, como se muestran
  persistencia/       RepositorioVariables en localStorage y contra kalc-backend; el ejecutor de consultas
  components/         ArbolFormula, FilaVariable (fila editable), CampoBorrable, VistaTabla, BotonSubir (volver arriba),
                      Vacio (lista vacía), EnlaceRepositorio
  paginas/            una por solapa: Probador, Variables, Funciones, Ayuda
  pruebas/montar.ts   montaje para tests de pantallas: PrimeVue sin tema, y Dialog reemplazado por un elemento simple
  pruebas/variablesIniciales.ts  las variables de ejemplo
  pruebas/variablesPostgres.ts   las de los ejemplos con PostgreSQL (conexión local)
  *.test.ts           tests al lado del código
public/               icono.svg y web.config (van tal cual a dist/)
ejemplos/             variables exportadas en JSON, para importar
paquetes/             kalc-X.Y.Z.tgz
scripts/dev.mjs       npm start: kalc-backend y la app juntos
scripts/publicar.mjs  npm run publicar: al IIS de un servidor Windows
```

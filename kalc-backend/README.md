# kalc-backend

La **API de variables de Kalc**, en Node + Express sobre PostgreSQL (`pg`). Guarda las variables
en la tabla `motor_variables` y corre las variables de consulta (los `SELECT` con parámetros), en
PostgreSQL o en las bases Oracle que se le conecten (`oracledb`). No
calcula fórmulas: eso lo hace [Kalc](../kalc), la librería, en el navegador de cada frontend.
Usa Kalc instalado desde el `.tgz` (`paquetes/`) para validar variables, leer los parámetros
`:Nombre` y convertir entre los valores de Kalc y los de la base.

Es una de las tres partes de Kalc (`kalc`, `kalc-backend` y `kalc-frontend`), cada una en su
carpeta de este repositorio. La arquitectura, cómo se relacionan y cómo instalar y levantar todo
están en el [README general](../README.md).

`kalc-frontend` usa esta API por HTTP (`/api/…`) y no importa código de acá.

## Uso

Requiere Node 22.12 o posterior (corre los `.ts` sin compilar).

```sh
npm install
cp .env.example .env  # y completar la conexión a la base (ver abajo)
npm start             # la API en http://localhost:7201/api/variables (node --watch)
npm test              # Vitest: rutas, consultas (PostgreSQL y Oracle), repositorio (con pools falsos), .env
npm run typecheck     # tsc, como Node 18 (lib ES2022)
npm run publicar      # a un servidor Windows con IIS (ver Despliegue)
```

En desarrollo no hace falta levantarla a mano: el `npm start` de `kalc-frontend` la arranca desde
`../kalc-backend` (o desde `KALC_BACKEND_DIR`), y si ya está corriendo usa esa. Vite le reenvía
`/api` al 7201.

## La base

1. Crear la base con `db/postgres/crear.sql`, como superusuario. Crea los usuarios `kalc` (el
   dueño, el del almacén) y `kalc_lectura` (solo `SELECT` en los esquemas de ejemplo: el de las
   consultas), la base `kalc`, la tabla `kalc.motor_variables` y los esquemas de ejemplo. Se puede
   volver a correr: los esquemas de ejemplo se recargan, y las variables guardadas no se tocan.

   ```sh
   psql -h localhost -U postgres -v clave_kalc=<clave> -v clave_lectura=<clave> -f db/postgres/crear.sql
   ```

   Para usar otro PostgreSQL, sin los ejemplos, alcanza con `db/postgres/variables.sql`.

2. Copiar `.env.example` como `.env` y completar las claves. `.env` no se versiona. Trae dos
   conexiones a la misma base: `almacen` (usuario `kalc`, guarda las variables) y `local` (usuario
   `kalc_lectura`, corre las consultas). Es la única conexión que escribe: las demás abren sesiones
   de solo lectura.

   Con `CONEXIONES`, cada conexión se declara con su nombre (`POSTGRES_<NOMBRE>_USUARIO`, `_CLAVE`,
   `_CONEXION` y, opcional, `_ESQUEMA`); `ALMACEN` dice dónde está `motor_variables` y `CONSULTAS`
   dónde pueden correr las variables de consulta (la primera es la de por defecto; una variable
   puede elegir otra de la lista). Para una sola base, sin `CONEXIONES`: `POSTGRES_USUARIO`,
   `POSTGRES_CLAVE`, `POSTGRES_CONEXION` y `POSTGRES_ESQUEMA`. Cada pool se abre la primera vez que
   se usa: con una base caída, la API arranca igual y falla solo lo que la usa.

3. `npm start`. El `.env` se lee solo al arrancar, y `node --watch` no lo vigila: después de
   cambiarlo, cerrar y volver a arrancar. Una variable de entorno de Windows con el mismo nombre
   gana sobre el `.env`.

Para pasar las variables de una base a otra: exportar el JSON desde la página Variables e
importarlo después del cambio.

## La API

| Método | Ruta | Hace |
|---|---|---|
| `GET` | `/api/version` | qué versión corre: `{ version, commit, fecha, kalc }` (la fecha es la de la publicación) |
| `GET` | `/api/variables` | lista, en el orden en que se agregaron |
| `PUT` | `/api/variables/:nombre` | agrega o reemplaza (sin distinguir mayúsculas) |
| `DELETE` | `/api/variables/:nombre` | borra |
| `PUT` | `/api/variables` | reemplaza todas, en una transacción |
| `POST` | `/api/consultas/:nombre` | corre la consulta guardada de esa variable con `{ parametros }` → `{ valor }`, o `{ tabla }` si es de tipo tabla |

Las variables viajan como el tipo `Variable` de Kalc, en JSON; una que no pasa `esVariable` y
`validarNombre` da 400. La API responde con `Cache-Control: no-store`: si no, el ARR del IIS guarda
en caché `GET /api/variables` y los frontends ven la lista de antes de guardar.

**La versión.** En el servidor no hay git: `npm run publicar` escribe el número de
`package.json`, el commit (8 caracteres; `+cambios` si se publicó con cambios sin commitear), la
fecha y la versión de Kalc en `version.json`, que viaja con lo publicado. En desarrollo no está, y
se arma al arrancar desde `package.json` y git (`src/version.ts`). El log de arranque también la
muestra. kalc-frontend la pone en su pie.

**Variables de consulta.** La API corre el SQL que tiene **guardado** en la variable: se mandan el
nombre y los valores de los parámetros, nunca SQL. Por eso un frontend guarda la variable antes de
pedir correrla. Antes de correrlo controla que sea una sola sentencia `SELECT` (o `WITH`), sin
`FOR UPDATE`, y lo corre en una transacción de solo lectura, con 15 segundos como máximo. Los
parámetros `:Nombre` se escriben igual en cualquier base y van siempre aparte del SQL. En
PostgreSQL pasan a `$1`, `$2`…, y las filas se leen con un cursor, hasta 2 para un valor y 10.001
para una tabla:

| Resultado | Valor |
|---|---|
| 1 fila, 1 columna | `integer`, `bigint`, `numeric`, `real`… → número; `varchar`, `text`, `char` → texto; `boolean` → lógico; `date`, `timestamp` → fecha; `NULL` → vacío |
| sin filas | `#N/D` |
| más de una fila o de una columna, un tipo que no se puede usar (`json`, arrays, `bytea`) | `#¡VALOR!` |
| error de la base | `#¡VALOR!`, con el mensaje (`no existe la relación «x»`) en el estado de la fila |

Una de tipo **tabla** lee hasta 10.000 filas (con más, `#¡VALOR!`: hay que filtrar o agrupar en
el SQL), con los mismos tipos por celda; dos columnas con el mismo nombre (`select a.id, b.id`) son
un error: necesitan alias distintos.

- Las columnas llegan en minúscula (salvo un alias entre comillas).
- Un parámetro lógico va como 1 o 0, que PostgreSQL acepta en una columna `boolean`.
- Se puede convertir con `::` (`fecha::date`, `:Desde::date`): no se lee como un parámetro. Si
  PostgreSQL no puede deducir el tipo de un parámetro (`select :x + 1`, con un decimal), hay que
  decírselo: `:x::numeric`.

Con varias bases, la variable dice en cuál corre (`origen.conexion`) y `GET /api/conexiones` da las
que se pueden elegir (`{ conexiones, porDefecto }`, solo los nombres). Una conexión que el servidor
no tiene da 422, con el mensaje en la variable.

### La base de ejemplo

`db/postgres/crear.sql` carga cuatro esquemas de ejemplo, con datos inventados:

| Esquema | Tablas |
|---|---|
| `kalc_data` | el de las variables iniciales de kalc-frontend: `expedientes` (400), `fueros`, `estados`, `jurisdicciones`, `regiones`. Las fechas de alta son relativas al día en que se carga |
| `hr` | el clásico esquema HR: `employees` (107), `departments`, `jobs`, `job_history`, `locations`, `countries`, `regions` y la vista `emp_details_view` |
| `scott` | el clásico SCOTT/TIGER: `emp` (14), `dept`, `salgrade`, `bonus` |
| `prueba` | para Kalc: `actividades` (con alícuotas de IVA e IIBB), `alicuotas_iva`, `escala` (por tramos), `feriados` 2026, `cotizaciones` (diarias, USD y EUR), `productos`, `sucursales`, `ventas` (2000) |

Con `POSTGRES_LOCAL_ESQUEMA=kalc_data,prueba,hr,scott` las tablas se nombran sin esquema. Por ejemplo,
de tipo número: `select count(*) from expedientes where baja is null`; de tipo tabla:
`select department_name, count(*) as empleados from emp_details_view group by department_name`.

### Consultas en Oracle

Una conexión puede ser Oracle (`ORACLE_<NOMBRE>_*` en el `.env`, ver `.env.example`), solo para
consultas: se agrega a `CONEXIONES` y a `CONSULTAS`, y la fila de la variable elige en qué base
corre. El SQL se escribe igual, con `:Nombre` (van como *bind variables*). Las diferencias:

- Tipos: `NUMBER` → número; `VARCHAR2`, `CHAR`, `CLOB` → texto; `DATE`, `TIMESTAMP` → fecha (la
  hora, como fracción del día); `BLOB`, `RAW` → `#¡VALOR!`.
- Las columnas llegan en mayúscula (salvo un alias entre comillas).
- Un parámetro lógico va como 1 o 0: Oracle 18 no tiene booleanos en SQL.
- Tampoco se acepta declarar PL/SQL en la consulta. Lo que esté en otro esquema se consulta con
  sinónimos, vistas o `_ESQUEMA` en la conexión. Conviene un usuario de solo lectura.
- Si al conectar da `NJS-116: password verifier type 0x939 is not supported`, la clave del usuario
  está guardada con el verificador viejo de Oracle 10g, que el modo thin no acepta. Reasignarle la
  clave (`ALTER USER … IDENTIFIED BY …`, puede ser la misma) genera los verificadores nuevos, salvo
  que la base solo genere el de 10g. Si no, modo thick: bajar el
  [Instant Client](https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html)
  19 o posterior (Basic Light alcanza, es un zip), descomprimirlo y poner su carpeta en
  `ORACLE_CLIENTE`. Un cliente 12.2 no sirve: `oracledb` pide 19 o posterior (DPI-1050).

## Pasar a otra versión de Kalc

El paquete está commiteado en `paquetes/`, para que `npm install` ande en cualquier máquina:

```sh
# en kalc
npm run pack                                   # → packs/kalc-X.Y.Z.tgz

# acá
cp ../kalc/packs/kalc-X.Y.Z.tgz paquetes/
npm install ./paquetes/kalc-X.Y.Z.tgz          # actualiza package.json
rm paquetes/kalc-<la anterior>.tgz
npm test && npm run typecheck
```

Conviene que kalc-frontend y esta API usen la misma versión de Kalc: el formato de las
variables (`Variable`) sale de ahí.

## Despliegue

Los scripts publican en un servidor Windows con IIS, sin entrar al servidor: una tarea
programada corre Node, y el IIS le reenvía `/kalc/api/`. kalc-frontend se publica aparte, desde su
carpeta, como archivos estáticos en la carpeta `kalc` del IIS; su `web.config` es el que reenvía
`/kalc/api/` acá.

```
navegador ──► IIS  /kalc/          kalc-frontend (C:\inetpub\wwwroot\kalc, lo publica kalc-frontend)
                   /kalc/api/…  ──► http://localhost:8082/api/…  node servidor\index.js (C:\app\kalc-backend)
                                                                  └─► PostgreSQL (y Oracle, si hay)
```

El servidor puede tener Node 18: `npm run publicar` compila a JavaScript
(`tsconfig.publicacion.json`) y la API lee el `.env` a mano (`src/entorno.ts`). El chequeo de
tipos usa `lib: ES2022`: si se usa algo que Node 18 no tiene (`toSorted`, `Object.groupBy`…),
`npm run typecheck` falla. Kalc se compila a ES2022 y su `tsconfig.lib.json` chequea lo mismo. El
build se hace en la PC de desarrollo, con Node 22.12 o posterior.

El destino sale de dos variables de entorno, sin valores por defecto:

| Variable | Qué es | Ejemplo |
|---|---|---|
| `KALC_BACKEND_DESTINO` | la carpeta publicada, compartida | `\\servidor\c\app\kalc-backend` |
| `KALC_BACKEND_URL` | `GET /api/version` a través del IIS | `http://servidor/kalc/api/version` |

### Primera vez

1. Conectarse a la carpeta compartida del servidor (`robocopy` no pide credenciales). El `*` pide
   la contraseña; la conexión dura hasta cerrar la sesión de Windows:

   ```powershell
   net use \\servidor\c /user:servidor\<usuario> *
   ```

   Si responde `error 1219`, borrar la conexión anterior con `net use \\servidor\c /delete`.

2. Publicar, desde PowerShell o cmd (Git Bash convierte `\\` en `\` y el destino queda mal):

   ```powershell
   $env:KALC_BACKEND_DESTINO = '\\servidor\c\app\kalc-backend'
   $env:KALC_BACKEND_URL = 'http://servidor/kalc/api/version'
   npm run publicar           # o npm run publicar:prueba: arma todo y muestra qué copiaría
   ```

   `scripts/publicar.mjs` compila a `publicacion/servidor/`, arma `publicacion/` con
   `scripts/servicio.ps1`, `paquetes/` (el `.tgz` de Kalc) y un `package.json` con solo las
   dependencias de producción, les hace `npm install` (así el servidor no necesita salida a
   internet) y la copia con `robocopy /MIR` a `KALC_BACKEND_DESTINO`. No toca `.env` ni `logs/`
   del destino.

3. En el servidor, crear `C:\app\kalc-backend\.env` (como el de `.env.example`), con `PUERTO=8082`
   y la conexión a la base. La tabla `motor_variables` tiene que existir (ver
   [La base](#la-base)), y el servidor tiene que llegar a la base.

4. En el servidor, en PowerShell como administrador:

   ```powershell
   cd C:\app\kalc-backend
   powershell -ExecutionPolicy Bypass -File .\scripts\servicio.ps1 -Accion instalar
   ```

   Registra la tarea programada `KalcBackend`: corre `node C:\app\kalc-backend\servidor\index.js`
   como SYSTEM al iniciar Windows, lo vuelve a arrancar al minuto si termina (se cae o lo matan) y
   escribe en `logs\servidor.log`, con la hora de cada arranque. También abre el puerto 8082 en el
   firewall. Al final muestra el estado y las últimas líneas del log. Si el log dice que el puerto
   está ocupado, es otro programa (un sitio del IIS, por ejemplo): `netstat -ano | findstr
   :<puerto>` y `Get-WebBinding` muestran cuál; cambiar `PUERTO` en el `.env`, repetir `instalar`
   con `-Puerto <otro>` (antes, `-Accion desinstalar`: la regla del firewall no se actualiza) y
   cambiar el puerto en el `web.config` de kalc-frontend (`public/web.config`).

5. Publicar kalc-frontend (`npm run publicar`, ver su README): deja en
   `C:\inetpub\wwwroot\kalc` los archivos y el `web.config` que reenvía `/kalc/api/` al 8082. Después,
   en el servidor, verificar que el IIS llegue a la API:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\servicio.ps1 -Accion iis
   ```

   Controla que estén URL Rewrite y Application Request Routing, habilita el proxy de ARR y pide
   `http://localhost/kalc/api/variables`.

### Versiones nuevas

```powershell
net use \\servidor\c /user:servidor\<usuario> *   # si no está conectada
npm run publicar                                    # en la PC de desarrollo: publica y reinicia
```

No hace falta entrar al servidor: la API se reinicia sola. `npm run publicar` crea la marca
`publicando` en la carpeta publicada; la API la ve (la mira cada 2 segundos, `src/publicacion.ts`)
y se cierra, así no quedan archivos en uso. Con la API abajo, copia; después borra la marca, y la
tarea, que vuelve a arrancar node al minuto de que termina, levanta la versión nueva. Mientras la
marca exista, la API no arranca. El script espera a que `GET /api/version` responda con el commit
publicado (hasta 2 minutos y medio) y lo dice. Si no vuelve: `servicio.ps1 -Accion estado` en el
servidor muestra el log. Para publicar las dos partes juntas está `scripts\publicar.ps1` en la
raíz del repositorio.

`servicio.ps1` también acepta `-Accion estado`, `detener` y `desinstalar`. El
`-ExecutionPolicy Bypass` hace falta si la política del servidor no deja correr scripts sin
firmar. El `.env` se lee al arrancar: después de cambiarlo, `-Accion reiniciar` en el servidor
(o publicar de nuevo).

## Versiones

El número está en `package.json` y sigue [SemVer](https://semver.org/lang/es/), aparte del de
Kalc. Para sacar una versión, con todo commiteado: `npm version patch` (o `minor` / `major`):
corre los tests y el chequeo de tipos, hace el commit `Versión X.Y.Z` con su tag y los sube.

## Archivos

```
src/
  index.ts              arranca: lee el .env, abre los pools (PostgreSQL y Oracle) y escucha en PUERTO (7201)
  conexiones.ts         las conexiones del .env (con nombre, o el formato simple) y sus pools, que se abren al usarlos
  app.ts                las rutas de la API, sobre cualquier RepositorioVariables (PostgreSQL, o uno en memoria en los tests)
  repositorioPostgres.ts  RepositorioVariables sobre la tabla motor_variables
  postgres.ts           corre las variables de consulta en PostgreSQL: :Nombre → $1, cursor de solo lectura, tipos de pg ↔ Valor
  consultas.ts          valida el SELECT, y lo mismo en Oracle: solo lectura, Oracle ↔ Valor de Kalc
  entorno.ts            lee el .env a mano (Node 18 no tiene --env-file)
  puerto.ts             antes de listen: en Windows, si el puerto lo tiene el IIS, listen no falla
  *.test.ts             tests al lado del código
db/postgres/            la base: crear.sql (usuarios y base) carga variables.sql (el almacén) y los ejemplos: kalc_data, hr, scott y prueba
paquetes/               el .tgz de Kalc, commiteado
scripts/
  publicar.mjs          publica en un servidor Windows con IIS (ver Despliegue)
  servicio.ps1          se corre en el servidor: tarea programada y verificación del IIS
```

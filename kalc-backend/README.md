# kalc-backend

La **API de variables de Kalc**, en Node + Express sobre Oracle (`oracledb`). Guarda las variables
en la tabla `motor_variables` y corre las variables de consulta (los `SELECT` con parámetros), en
Oracle o en PostgreSQL (`pg`). No
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
npm test              # Vitest: rutas, consultas (Oracle y PostgreSQL), repositorio Oracle (con pools falsos), .env
npm run typecheck     # tsc, como Node 18 (lib ES2022)
npm run publicar      # a un servidor Windows con IIS (ver Despliegue)
```

En desarrollo no hace falta levantarla a mano: el `npm start` de `kalc-frontend` la arranca desde
`../kalc-backend` (o desde `KALC_BACKEND_DIR`), y si ya está corriendo usa esa. Vite le reenvía
`/api` al 7201.

## La base

1. Crear la tabla una vez en el esquema: `db/oracle/variables.sql` (con `sqlplus`, por el `/` del
   trigger). El id sale de una secuencia con un trigger y no se usa `IS JSON`: así anda también en
   bases 18c con el parámetro `COMPATIBLE` en 11, que no aceptan `IDENTITY` (ORA-00406). Si la
   tabla se creó antes de la 1.2.0 de Kalc, correr también `db/oracle/variables-1.2.0.sql` (acepta
   el tipo `tabla`; sin eso, guardar una variable de tipo tabla da error 500 por el CHECK de la
   columna `tipo`), y si es de antes de la 1.3.0, `db/oracle/variables-1.3.0.sql` (la columna
   `COLUMNAS`; sin ella no lista las variables). `db/oracle/select_motor.sql` muestra lo que hay
   guardado.
2. Copiar `.env.example` como `.env` y completar `ORACLE_USUARIO`, `ORACLE_CLAVE` y
   `ORACLE_CONEXION`: un alias del `tnsnames.ora` (con `TNS_ADMIN`), el descriptor completo
   (sirve con SID) o `host:puerto/servicio`; hay ejemplos de los tres en `.env.example`. `.env` no
   se versiona.

   **Varias bases**: con `CONEXIONES=desarrollo,reportes`, cada una se declara con su nombre
   (`ORACLE_DESARROLLO_USUARIO`, `_CLAVE`, `_CONEXION` y, opcional, `_ESQUEMA`, que fija el
   esquema de la sesión); `ALMACEN` dice dónde está `motor_variables` y `CONSULTAS` dónde pueden
   correr las variables de consulta (la primera es la de por defecto; una variable puede elegir
   otra de la lista). Ejemplo completo en `.env.example`. Cada pool se abre la primera vez que se
   usa: con una base caída, la API arranca igual y falla solo lo que la usa.

   Si al conectar da `NJS-116: password verifier type 0x939 is not supported`, la clave del
   usuario está guardada con el verificador viejo de Oracle 10g, que el modo thin no acepta.
   Reasignarle la clave (`ALTER USER … IDENTIFIED BY …`, puede ser la misma) genera los
   verificadores nuevos, salvo que la base solo genere el de 10g (con `SEC_CASE_SENSITIVE_LOGON`
   en FALSE). Si no, modo thick: bajar el
   [Instant Client](https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html)
   19 o posterior (Basic Light alcanza, es un zip), descomprimirlo y poner su carpeta en
   `ORACLE_CLIENTE` (`D:\oracle\instantclient_19_25`). Un cliente 12.2 no sirve: `oracledb` pide 19
   o posterior (DPI-1050). En el servidor hace falta lo mismo.
3. `npm start`. El `.env` se lee solo al arrancar, y `node --watch` no lo vigila: después de
   cambiarlo, cerrar y volver a arrancar. Una variable de entorno de Windows con el mismo nombre
   gana sobre el `.env`.

Para probar sin una base Oracle propia alcanza con
[Oracle Database Free](https://www.oracle.com/database/free/) (también en Docker), con
`ORACLE_CONEXION=localhost:1521/FREEPDB1`.

### Usar otra base (esquema nuevo, sin `motor_variables`)

Para pasar a un esquema nuevo hacen falta estos datos, que en los pasos van así:

| En los pasos | Qué es | Ejemplo |
|---|---|---|
| `<host>` | host de la base | `servidor` |
| `<puerto>` | puerto | `1521` |
| `<sid>` | SID | `ORCL` |
| `<usuario>` | usuario del esquema, que pueda crear tablas, secuencias, triggers e índices | `KALC` |
| `<clave>` | su clave | |

1. **Probar la conexión** con ese usuario (sqlplus u otro cliente), con el descriptor completo.
   Con SID, la forma corta `host:puerto/servicio` no sirve:

   ```
   (DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=<host>)(PORT=<puerto>))(CONNECT_DATA=(SID=<sid>)))
   ```

2. **Crear la tabla**, una sola vez: `db/oracle/variables.sql`, con sqlplus (por el `/` del trigger).
   Crea la secuencia, la tabla `motor_variables`, el trigger del id y el índice único por nombre.
   En una base nueva **no** hacen falta `variables-1.2.0.sql` ni `variables-1.3.0.sql`: son
   migraciones de tablas viejas.

   ```sh
   sqlplus <usuario>/<clave>@"(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=<host>)(PORT=<puerto>))(CONNECT_DATA=(SID=<sid>)))" @db/oracle/variables.sql
   ```

3. **Cambiar el `.env`** (antes, guardar una copia del actual para poder volver):

   ```sh
   ORACLE_USUARIO=<usuario>
   ORACLE_CLAVE=<clave>
   ORACLE_CONEXION=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=<host>)(PORT=<puerto>))(CONNECT_DATA=(SID=<sid>)))
   ```

   `ORACLE_CLIENTE` (modo thick, con el Instant Client) puede quedar como está: anda en los dos
   casos. Hace falta si al conectar da `NJS-116`. Las `ORACLE_CONSULTAS_*` son opcionales: otro
   usuario, de solo lectura, para las consultas.

   Para mover solo el almacén y seguir consultando la base de antes, conexiones con nombre:

   ```sh
   CONEXIONES=desarrollo,reportes
   ALMACEN=desarrollo
   CONSULTAS=reportes
   ORACLE_DESARROLLO_USUARIO=<usuario>
   ORACLE_DESARROLLO_CLAVE=<clave>
   ORACLE_DESARROLLO_CONEXION=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=<host>)(PORT=<puerto>))(CONNECT_DATA=(SID=<sid>)))
   ORACLE_REPORTES_USUARIO=...      # los ORACLE_* de antes, con el nombre en el medio
   ORACLE_REPORTES_CLAVE=...
   ORACLE_REPORTES_CONEXION=...
   ```

   Las variables del almacén anterior se pasan exportando el JSON desde la página Variables e
   importándolo después del cambio.

4. **Reiniciar la API**: cerrar lo que esté en el 7201 (también el `npm start` de `kalc-frontend`,
   si la levantó) y volver a arrancar. Los errores de
   conexión salen en su consola.

Lo que no viene solo: las variables de la base anterior (no pasan, salvo copiando las filas de
`motor_variables`) y las consultas, que leen tablas del esquema anterior: en el nuevo hay que
escribirlas contra tablas que existan (o darle permisos o sinónimos al usuario). kalc-frontend
pasa a la base nueva solo: usa esta API.

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
`FOR UPDATE` ni PL/SQL, y lo corre en una transacción de solo lectura, con 15 segundos como máximo,
leyendo hasta 2 filas:

| Resultado | Valor |
|---|---|
| 1 fila, 1 columna | `NUMBER` → número; `VARCHAR2`, `CHAR`, `CLOB` → texto; `DATE`, `TIMESTAMP` → fecha (la hora, como fracción del día); `NULL` → vacío |
| sin filas | `#N/D` |
| más de una fila o de una columna, un tipo que no se puede usar (`BLOB`, `RAW`) | `#¡VALOR!` |
| error de Oracle | `#¡VALOR!`, con el mensaje (`ORA-00942: …`) en el estado de la fila |

Una de tipo **tabla** lee hasta 10.000 filas (con más, `#¡VALOR!`: hay que filtrar o agrupar en
el SQL), con los mismos tipos por celda; las columnas se llaman como las devuelve Oracle (en
mayúscula, salvo un alias entre comillas), y dos con el mismo nombre (`select a.id, b.id`) son un
error: necesitan alias distintos.

Los parámetros van como *bind variables* (un lógico, como 1 o 0: Oracle 18 no tiene booleanos en
SQL). Lo que esté en otro esquema se consulta con sinónimos o vistas, o con `_ESQUEMA` en la
conexión. Conviene que las consultas corran con un usuario de solo lectura: una conexión con ese
usuario, nombrada en `CONSULTAS` (en el formato simple, `ORACLE_CONSULTAS_USUARIO` y
`ORACLE_CONSULTAS_CLAVE`; sin eso, usan `ORACLE_USUARIO`).

### Consultas en PostgreSQL

Una conexión puede ser PostgreSQL (`POSTGRES_<NOMBRE>_*` en el `.env`, ver `.env.example`), solo
para consultas: las variables se guardan siempre en Oracle. El SQL se escribe igual, con los
parámetros `:Nombre` (la API los pasa a `$1`, `$2`…), y corre igual: transacción de solo lectura
(además, la sesión abre con `default_transaction_read_only`), 15 segundos como máximo, y las filas
se leen con un cursor, hasta 2 para un valor y 10.001 para una tabla. Las diferencias:

- Tipos: `integer`, `bigint`, `numeric`, `real`… → número; `varchar`, `text`, `char` → texto;
  `boolean` → lógico; `date`, `timestamp` → fecha; `json`, arrays, `bytea` → `#¡VALOR!`.
- Las columnas llegan en minúscula (salvo un alias entre comillas).
- Un parámetro lógico va como 1 o 0, que PostgreSQL acepta en una columna `boolean`.
- Se puede convertir con `::` (`fecha::date`, `:Desde::date`): desde Kalc 1.5.1 no se lee como un
  parámetro. Si PostgreSQL no puede deducir el tipo de un parámetro (`select :x + 1`, con un
  decimal), hay que decírselo: `:x::numeric`.
- El error es el de PostgreSQL, sin código (`no existe la relación «x»`).

### La base de ejemplo (PostgreSQL)

La base de ejemplo (`kalc`, en `localhost:5432`) se crea con `db/postgres/crear.sql`, como
superusuario. Crea los usuarios `kalc` (el dueño) y `kalc_lectura` (solo `SELECT`: el del `.env`)
y cuatro esquemas, que se vuelven a cargar cada vez que se corre. Los datos son inventados:

```sh
psql -h localhost -U postgres -v clave_kalc=<clave> -v clave_lectura=<clave> -f db/postgres/crear.sql
```

| Esquema | Tablas |
|---|---|
| `juzgado` | el de las variables iniciales de kalc-frontend: `expedientes` (400), `fueros`, `estados`, `jurisdicciones`, `regiones`. Las fechas de alta son relativas al día en que se carga |
| `hr` | el de ejemplo HR de Oracle: `employees` (107), `departments`, `jobs`, `job_history`, `locations`, `countries`, `regions` y la vista `emp_details_view` |
| `scott` | el clásico SCOTT/TIGER: `emp` (14), `dept`, `salgrade`, `bonus` |
| `prueba` | para Kalc: `actividades` (con alícuotas de IVA e IIBB), `alicuotas_iva`, `escala` (por tramos), `feriados` 2026, `cotizaciones` (diarias, USD y EUR), `productos`, `sucursales`, `ventas` (2000) |

Con `POSTGRES_LOCAL_ESQUEMA=juzgado,prueba,hr,scott` las tablas se nombran sin esquema, y con
`local` primera en `CONSULTAS`, las variables iniciales de kalc-frontend corren ahí. Por ejemplo,
de tipo número: `select count(*) from expedientes where baja is null`; de tipo tabla:
`select department_name, count(*) as empleados from emp_details_view group by department_name`.

Con varias bases, la variable dice en cuál corre (`origen.conexion`, desde Kalc 1.5.0) y
`GET /api/conexiones` da las que se pueden elegir (`{ conexiones, porDefecto }`, solo los nombres).
Una conexión que el servidor no tiene da 422, con el mensaje en la variable.

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
                                                                  └─► Oracle (y PostgreSQL, si hay)
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
   y la conexión a la base. `ORACLE_CLIENTE` hace falta solo si la clave del usuario tiene el
   verificador de Oracle 10g (NJS-116); el Instant Client se copia como carpeta, sin instalar.
   La tabla `motor_variables` tiene que existir en ese esquema (ver [La base](#la-base)), y el
   servidor tiene que llegar a la base.

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
  index.ts              arranca: lee el .env, abre los pools (Oracle y PostgreSQL) y escucha en PUERTO (7201)
  conexiones.ts         las conexiones del .env (con nombre, o el formato simple) y sus pools, que se abren al usarlos
  app.ts                las rutas de la API, sobre cualquier RepositorioVariables (Oracle, o uno en memoria en los tests)
  repositorioOracle.ts  RepositorioVariables sobre la tabla motor_variables
  consultas.ts          corre las variables de consulta: valida el SELECT, solo lectura, Oracle ↔ Valor de Kalc
  postgres.ts           lo mismo en PostgreSQL: :Nombre → $1, cursor de solo lectura, tipos de pg ↔ Valor
  entorno.ts            lee el .env a mano (Node 18 no tiene --env-file)
  puerto.ts             antes de listen: en Windows, si el puerto lo tiene el IIS, listen no falla
  *.test.ts             tests al lado del código
db/oracle/              la tabla motor_variables y sus migraciones, en Oracle; se corren a mano en el esquema.
                        Otra base iría en db/<base>/, con su repositorio en src/ (como repositorioOracle.ts)
db/postgres/            la base PostgreSQL de ejemplo para consultas: crear.sql (usuarios y base) carga juzgado, hr, scott y prueba
paquetes/               el .tgz de Kalc, commiteado
scripts/
  publicar.mjs          publica en un servidor Windows con IIS (ver Despliegue)
  servicio.ps1          se corre en el servidor: tarea programada y verificación del IIS
```

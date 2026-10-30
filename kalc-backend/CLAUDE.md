# kalc-backend: la API de variables de Kalc

API en Node + Express sobre Oracle (`oracledb`): guarda las variables de Kalc en la tabla
`motor_variables` y corre las variables de consulta. Hasta el 14/10/2026 estaba adentro de `kalc`
(`backend/`); se separó para que cada parte tenga su carpeta.

## Las tres partes

Es una de las tres partes de Kalc (`kalc`, `kalc-backend` y `kalc-frontend`), cada una en su
carpeta del repositorio. La arquitectura, cómo se relacionan y cómo instalar y levantar todo
están en el README general, `../README.md`.

- Kalc se usa **solo** por el `.tgz` (`import … from 'kalc'`), nunca por rutas a `../kalc`. Lo
  que hace falta y no está exportado se agrega a la API pública de Kalc (versión minor).
- kalc-frontend habla con esta API solo por HTTP.
- No sirve archivos estáticos: kalc-frontend lo sirve Vite en desarrollo y el IIS en el servidor.
- El `npm start` de `kalc-frontend` levanta esta API desde
  `../kalc-backend` (`node --watch src/index.ts`), salvo que ya haya algo en el 7201.

## Stack

- Node 22.12+ en desarrollo, corre los `.ts` directo (imports con `.ts`, `erasableSyntaxOnly`).
- Express 5, `oracledb` 7 (thin; thick si el `.env` tiene `ORACLE_CLIENTE`), `pg` 8, Vitest, TypeScript ~6.
- `tsconfig.json` solo chequea tipos, con `lib: ES2022`: el servidor puede tener **Node 18**.
  `tsconfig.publicacion.json` compila a `publicacion/servidor/`.
- Instalar con `npm install` (npm 11; con el `npm` 10 que viene con algunos Node da `Cannot read
  properties of null (reading 'edgesOut')`: `npx npm@11 install`).

## Base

`db/oracle/variables.sql` crea la tabla (id por secuencia + trigger, origen JSON en CLOB, nombre
único por UPPER; sin `IDENTITY` ni `IS JSON`, para bases con `COMPATIBLE` 11);
`variables-1.2.0.sql` y `variables-1.3.0.sql` son migraciones de tablas viejas. Con una clave con
el verificador 10g, el modo thin la rechaza (NJS-116): modo thick con `ORACLE_CLIENTE` (Instant
Client 19+; un cliente 12.2 no sirve).

Varias conexiones con nombre (`CONEXIONES`, ver `src/conexiones.ts` y `.env.example`): el almacén
(`motor_variables`, siempre Oracle) y las conexiones donde corren las consultas (`CONSULTAS`, la
primera es la de por defecto). Las consultas van siempre en una transacción de solo lectura.

Una conexión puede ser PostgreSQL (`POSTGRES_<NOMBRE>_*`, `src/postgres.ts`, driver `pg`), solo
para consultas. En desarrollo, `local`: PostgreSQL en `localhost:5432`, base `kalc`, usuario
`kalc_lectura`, esquemas `juzgado` (el de las variables iniciales de kalc-frontend), `hr`, `scott`
(los de ejemplo de Oracle) y `prueba`, creados con `db/postgres/crear.sql`. Todos los datos son
inventados. `x::int` no es un parámetro desde Kalc 1.5.1.

## Despliegue

En un servidor Windows con IIS. `npm run publicar` compila, arma `publicacion/` (servidor/,
scripts/servicio.ps1, paquetes/, package.json con las dependencias de producción) con su
`npm install`, y lo copia con robocopy a `KALC_BACKEND_DESTINO` (sin valor por defecto, como
`KALC_BACKEND_URL`). Ahí corre `node servidor\index.js` como tarea programada `KalcBackend` en el
puerto **8082**. El IIS sirve kalc-frontend como estáticos en `C:\inetpub\wwwroot\kalc` y su
`web.config` (en kalc-frontend: `public/web.config`) reenvía `/kalc/api/` al 8082. `publicar` no
toca el `.env` del servidor y reinicia la API sin entrar al servidor: crea la marca `publicando` en
la carpeta publicada, la API se cierra sola al verla (`src/publicacion.ts`) y no arranca mientras
exista; copia, borra la marca, y la tarea (que vuelve a arrancar node al minuto) levanta la nueva.
Nada de ejecución remota (WinRM, `schtasks /S`). Después de cambiar el `.env`,
`scripts\servicio.ps1 -Accion reiniciar` en el servidor, como administrador.

## Tests

- Vitest, tests al lado del código (`src/*.test.ts`). Oracle no se toca: los tests pasan pools
  falsos (`Pool`, `PoolConsultas`) y un repositorio en memoria.
- Nada de lógica nueva sin test.

## Estilo

- Responder en español rioplatense. Nombres de dominio en español.
- Comentarios cortos que expliquen el **por qué**.
- Commits en español: `Feat: <Área>: <qué>` / `Fix: …` / `Test: …`.

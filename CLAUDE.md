# Kalc

Este repositorio tiene las tres partes de Kalc, cada una en su carpeta, con su `package.json`, su
README y su CLAUDE.md:

| Carpeta | Qué es | Puerto |
|---|---|---|
| `kalc/` | la librería: el motor de fórmulas tipo Excel (`motor/`); `npm run pack` → `packs/kalc-X.Y.Z.tgz` | — |
| `kalc-backend/` | la API de variables (Express + pg + oracledb): PostgreSQL (`motor_variables`, scripts en `db/postgres/`) y las consultas, en PostgreSQL u Oracle | 7201 |
| `kalc-frontend/` | la aplicación en Vue 3 + PrimeVue: Probador, Variables, Funciones, Ayuda | 7200 |

## Qué va acá y qué en cada carpeta

- **En la raíz, solo lo que es de las tres**: la arquitectura (`docs/arquitectura.drawio` y el
  diagrama del README), los scripts que usan más de una (`scripts/publicar.ps1`), cómo instalar y
  levantar todo, cómo pasa un cambio del motor a las otras dos partes, la publicación en general.
  Todo en `README.md`.
- **En cada carpeta, solo lo suyo**: su README y su CLAUDE.md no repiten la tabla de las tres
  partes ni el diagrama; apuntan acá. Antes de tocar una, leer su CLAUDE.md.
- Los comandos de npm se corren adentro de cada carpeta (o con los atajos del `package.json` de la
  raíz). git es uno solo, para las tres.

## Reglas entre las partes

- Nadie importa código de otra carpeta: la librería solo por el `.tgz` (`paquetes/` en
  `kalc-backend` y `kalc-frontend`), la API solo por HTTP (`/api/…`).
- Al cambiar el motor: versión nueva en `kalc`, `npm run pack`, y copiar el `.tgz` a las otras dos.
- En desarrollo alcanza con `npm start` en `kalc-frontend` (o en la raíz): levanta también `kalc-backend`.
- Publicar en un servidor: `scripts\publicar.ps1 -Servidor <servidor>` (las dos partes, sin entrar
  al servidor; `-Verificar` dice qué está publicado). Nada de ejecución remota: el reinicio de
  kalc-backend es con la marca `publicando` (ver su CLAUDE.md).
- Nada de datos reales en el repositorio: ni servidores, ni IPs, ni nombres de bases o esquemas, ni
  credenciales. Los ejemplos usan la base de ejemplo (`kalc-backend/db/postgres/`, datos inventados)
  y nombres genéricos (`servidor`, `desarrollo`, `reportes`).
- Separadas en tres partes el 14/10/2026; en un solo repositorio desde el 30/10/2026 (ver "Historia"
  en el README).

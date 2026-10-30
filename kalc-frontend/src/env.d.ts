/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Versión de package.json, commit y fecha del build: los pone vite.config.ts. */
  readonly VITE_VERSION: string
  readonly VITE_VERSION_COMMIT: string
  readonly VITE_VERSION_FECHA: string
  /** El repositorio del proyecto (`repository` de package.json); vacío si no está. */
  readonly VITE_REPOSITORIO: string
  /** URL de la API de variables (`/api`). Sin ella, las variables se guardan en el navegador. */
  readonly VITE_API?: string
}

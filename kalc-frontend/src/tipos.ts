import type { TipoVariable } from 'kalc'

/** Los tipos de variable, como se muestran: en el desplegable de la fila y al ordenar la tabla. */
export const TIPOS: readonly { id: TipoVariable; titulo: string }[] = [
  { id: 'numero', titulo: 'Número' },
  { id: 'entero', titulo: 'Entero' },
  { id: 'texto', titulo: 'Texto' },
  { id: 'logico', titulo: 'Lógico' },
  { id: 'fecha', titulo: 'Fecha' },
  { id: 'tabla', titulo: 'Tabla' },
]

import type { Variable } from './variables.ts'

/**
 * Dónde se guardan las variables: en el navegador, contra una API o en una base. La implementa la
 * aplicación (kalc-frontend y kalc-backend tienen las suyas); es asincrónica por eso.
 */
export interface RepositorioVariables {
  /** Todas, en el orden en que se guardaron. */
  listar(): Promise<Variable[]>
  /** Agrega una variable, o reemplaza la del mismo nombre (sin distinguir mayúsculas) en su lugar. */
  guardar(variable: Variable): Promise<void>
  borrar(nombre: string): Promise<void>
  /** Reemplaza todas: para importar, o para guardar las fórmulas que corrigió un renombre. */
  reemplazarTodas(variables: readonly Variable[]): Promise<void>
}

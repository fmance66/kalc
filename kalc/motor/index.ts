/**
 * API pública de Kalc, el motor de fórmulas: lo único que se exporta de la librería.
 * TypeScript puro: nada de Vue ni DOM (lo usan kalc-frontend, en el navegador, y kalc-backend, en Node).
 *
 * Congelada desde la 1.0.0: sacar o cambiar algo de acá rompe a quien la usa y sube la versión
 * major. `index.test.ts` lista lo exportado para que ningún cambio pase sin querer.
 */

export { dependencias, hijos, type Nodo, type OperadorBinario } from './ast.ts'
export { fechaASerie, serieAFecha, type FechaCivil } from './calendario.ts'
export {
  codigoSql,
  ErrorConsulta,
  parametrosConsulta,
  sirveComoParametro,
  type Consulta,
  type EjecutorConsultas,
  type ParametroConsulta,
} from './consultas.ts'
export { evaluar, evaluarArbol, evaluarComoTabla, type Contexto } from './evaluador.ts'
export { escribirDatos, leerDatos, type Rango, type Tabla } from './tablas.ts'
// Para las funciones propias: cómo convierte Excel cada argumento.
export { aLogico, argEntero, argNumero, argTexto } from './funciones/comunes.ts'
export { CONTEXTO_EJEMPLOS } from './funciones/ejemplos.ts'
export { buscarFuncion, listarFunciones, registrarFuncion, type Argumento, type Categoria, type DefinicionFuncion } from './funciones/registro.ts'
export { ErrorSintaxis, type Posicion } from './lexer.ts'
export { parsear, type ResultadoParseo } from './parser.ts'
export type { RepositorioVariables } from './repositorio.ts'
export {
  aNumero,
  aTexto,
  comparar,
  error,
  esError,
  fecha,
  formatear,
  logico,
  numero,
  numeroATexto,
  redondear15,
  texto,
  textoANumero,
  VACIO,
  type CodigoError,
  type Valor,
  type ValorError,
} from './valores.ts'
export {
  crearCatalogo,
  esTabla,
  esVariable,
  leerConstante,
  nombreEnFormula,
  problemaDeTipo,
  validarNombre,
  type Catalogo,
  type ColumnaCalculada,
  type EstadoVariable,
  type Problema,
  type TipoVariable,
  type Variable,
} from './variables.ts'

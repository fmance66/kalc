/** Información: ESNUMERO, ESTEXTO, ESBLANCO, ESERROR. Nunca dan error: dicen qué tipo de valor hay. */

import type { DefinicionFuncion } from './registro.ts'
import { logico, VACIO, type Valor } from '../valores.ts'

function es(nombre: string, alias: string, descripcion: string, ejemplo: string, prueba: (v: Valor) => boolean): DefinicionFuncion {
  return {
    nombre,
    alias: [alias],
    minimo: 1,
    maximo: 1,
    categoria: 'Información',
    porCelda: true,
    firma: `${nombre}(valor)`,
    descripcion,
    ejemplo,
    evaluar: ([a]) => logico(prueba(a?.() ?? VACIO)),
  }
}

export const INFORMACION: DefinicionFuncion[] = [
  es('ESNUMERO', 'ISNUMBER', 'VERDADERO si el valor es un número (o una fecha). Un texto como "3" no cuenta.', 'ESNUMERO("3")', (v) => v.tipo === 'numero' || v.tipo === 'fecha'),
  es('ESTEXTO', 'ISTEXT', 'VERDADERO si el valor es un texto.', 'ESTEXTO("3")', (v) => v.tipo === 'texto'),
  es('ESBLANCO', 'ISBLANK', 'VERDADERO si es una variable sin valor. Un texto vacío ("") no es blanco.', 'ESBLANCO("")', (v) => v.tipo === 'vacio'),
  es('ESERROR', 'ISERROR', 'VERDADERO si el valor es cualquier error (#N/D, #¡DIV/0!…).', 'ESERROR(1/0)', (v) => v.tipo === 'error'),
]

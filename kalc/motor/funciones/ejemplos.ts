/**
 * La tabla que usan los ejemplos de las funciones de tablas (`SUMAR.SI(Causas[Fuero]; …)`): el
 * catálogo los evalúa con este contexto, así se calculan sin una base. Datos inventados.
 */

import type { Contexto } from '../evaluador.ts'
import type { Tabla } from '../tablas.ts'
import { numero, texto, VACIO, type Valor } from '../valores.ts'

const fila = (causa: string, fuero: string, monto: number, fojas: number | null): Valor[] => [
  texto(causa),
  texto(fuero),
  numero(monto),
  fojas === null ? VACIO : numero(fojas),
]

const CAUSAS: Tabla = {
  columnas: ['Causa', 'Fuero', 'Monto', 'Fojas'],
  filas: [
    fila('Pérez', 'Federal', 320000, 40),
    fila('Gómez', 'Federal', 850000, 12),
    fila('López', 'Penal Económico', 150000, 60),
    fila('Díaz', 'Penal Económico', 980000, 8),
    fila('Ruiz', 'Criminal', 210000, null),
    fila('Sosa', 'Criminal', 450000, 25),
  ],
}

/** Con qué se evalúan los ejemplos del registro: la tabla Causas (causa, fuero, monto, fojas). */
export const CONTEXTO_EJEMPLOS: Readonly<Contexto> & { tablas: Readonly<Record<string, Tabla>> } = { tablas: { Causas: CAUSAS } }

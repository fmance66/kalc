/**
 * Búsqueda en tablas: BUSCARV, BUSCARX, COINCIDIR, INDICE, FILAS, COLUMNAS. Los ejemplos usan la
 * tabla Causas de CONTEXTO_EJEMPLOS.
 */

import { aLogico, argEntero, argNumero, rangoDe, resultado } from './comunes.ts'
import { buscar } from './criterios.ts'
import type { Argumento, DefinicionFuncion } from './registro.ts'
import { anchoDe, type Rango } from '../tablas.ts'
import { error, esError, numero, VACIO, type Valor, type ValorError } from '../valores.ts'

/** Lo buscado: un error se propaga; vacío no encuentra nada (#N/D), como en Excel. */
function buscado(a: Argumento | undefined): Valor {
  const v = a?.() ?? VACIO
  return v.tipo === 'vacio' ? error('#N/D') : v
}

/** Las celdas de un rango de una fila o una columna; `null` si tiene varias de las dos. */
function vector(r: Rango): readonly Valor[] | null {
  if (r.length === 1) return r[0] ?? []
  if (anchoDe(r) <= 1) return r.map((f) => f[0] ?? VACIO)
  return null
}

/** Una celda del rango (fila y columna desde 1): fuera del rango, #¡REF!. */
function celda(r: Rango, fila: number, columna: number): Valor {
  if (fila > r.length || columna > anchoDe(r)) return error('#¡REF!')
  return r[fila - 1]?.[columna - 1] ?? VACIO
}

/** La posición de lo buscado en un vector, o el error. */
function posicion(valor: Valor, lista: readonly Valor[], modo: Parameters<typeof buscar>[2]): number | ValorError {
  const i = buscar(valor, lista, modo)
  return i < 0 ? error('#N/D') : i
}

export const BUSQUEDA: DefinicionFuncion[] = [
  {
    nombre: 'BUSCARV',
    alias: ['VLOOKUP'],
    minimo: 3,
    maximo: 4,
    categoria: 'Búsqueda',
    firma: 'BUSCARV(valor; tabla; columna; [ordenado])',
    descripcion:
      'Busca el valor en la primera columna de la tabla y devuelve el de esa fila en la columna indicada (desde 1). Con ordenado FALSO busca el igual (admite comodines); si falta o es VERDADERO, el mayor que no se pase (la tabla tiene que estar ordenada).',
    ejemplo: 'BUSCARV("Gómez"; Causas; 3; FALSO)',
    evaluar: ([valor, tabla, columna, ordenado]) => {
      const v = buscado(valor)
      if (esError(v)) return v
      const r = rangoDe(tabla)
      if ('tipo' in r) return r
      const c = argEntero(columna)
      if (typeof c !== 'number') return c
      if (c < 1) return error('#¡VALOR!')
      if (c > anchoDe(r)) return error('#¡REF!')
      // Omitido (`BUSCARV(x; T; 2;)`) es FALSO, como en Excel; si no está, VERDADERO.
      const aprox = ordenado ? aLogico(ordenado()) : true
      if (typeof aprox !== 'boolean') return aprox
      const i = posicion(v, r.map((f) => f[0] ?? VACIO), aprox ? 'menor' : 'exacta')
      return typeof i === 'number' ? celda(r, i + 1, c) : i
    },
  },
  {
    nombre: 'BUSCARX',
    alias: ['XLOOKUP'],
    minimo: 3,
    maximo: 4,
    categoria: 'Búsqueda',
    firma: 'BUSCARX(valor; rango_búsqueda; rango_resultado; [si_no_está])',
    descripcion:
      'Busca el valor (igual, con comodines) en una columna y devuelve el de la misma fila en otra. Si no está, si_no_está (o #N/D). Solo la búsqueda exacta: sin los modos de Excel.',
    ejemplo: 'BUSCARX("López"; Causas[Causa]; Causas[Fojas]; "No está")',
    evaluar: ([valor, rangoBusqueda, rangoResultado, siNoEsta]) => {
      const v = valor?.() ?? VACIO
      if (esError(v)) return v
      const rb = rangoDe(rangoBusqueda)
      if ('tipo' in rb) return rb
      const rr = rangoDe(rangoResultado)
      if ('tipo' in rr) return rr
      const lista = vector(rb)
      if (!lista) return error('#¡VALOR!')
      // En columna: la fila del resultado; en fila: la columna. Tienen que tener el mismo largo.
      const enColumna = rb.length !== 1 || anchoDe(rb) === 1
      if (enColumna ? rr.length !== rb.length : anchoDe(rr) !== anchoDe(rb)) return error('#¡VALOR!')
      // Vacío no encuentra nada: va a si_no_está.
      const i = buscar(v, lista, 'exacta')
      if (i < 0) return siNoEsta ? resultado(siNoEsta) : error('#N/D')
      // Devolvería toda la fila (o la columna): sin arrays, solo si es una celda.
      if (enColumna ? anchoDe(rr) !== 1 : rr.length !== 1) return error('#¡VALOR!')
      return enColumna ? celda(rr, i + 1, 1) : celda(rr, 1, i + 1)
    },
  },
  {
    nombre: 'COINCIDIR',
    alias: ['MATCH'],
    minimo: 2,
    maximo: 3,
    categoria: 'Búsqueda',
    firma: 'COINCIDIR(valor; rango; [tipo])',
    descripcion:
      'La posición del valor en una columna (o fila), desde 1. Tipo 0: el igual (con comodines); 1 (si falta): el mayor que no se pase, con los datos en orden ascendente; -1: el menor que no baje, en orden descendente.',
    ejemplo: 'COINCIDIR("Ruiz"; Causas[Causa]; 0)',
    evaluar: ([valor, rango, tipo]) => {
      const v = buscado(valor)
      if (esError(v)) return v
      const r = rangoDe(rango)
      if ('tipo' in r) return r
      const t = tipo ? argNumero(tipo) : 1
      if (typeof t !== 'number') return t
      const lista = vector(r)
      if (!lista) return error('#N/D')
      const i = posicion(v, lista, t > 0 ? 'menor' : t < 0 ? 'mayor' : 'exacta')
      return typeof i === 'number' ? numero(i + 1) : i
    },
  },
  {
    nombre: 'INDICE',
    alias: ['INDEX'],
    minimo: 2,
    maximo: 3,
    categoria: 'Búsqueda',
    firma: 'INDICE(rango; fila; [columna])',
    descripcion: 'El valor de esa fila y columna del rango (desde 1). En una sola columna (o fila) alcanza con la posición.',
    ejemplo: 'INDICE(Causas; 4; 1)',
    evaluar: ([rango, fila, columna]) => {
      const r = rangoDe(rango)
      if ('tipo' in r) return r
      let f = argEntero(fila)
      if (typeof f !== 'number') return f
      let c = columna ? argEntero(columna) : undefined
      if (typeof c === 'object') return c
      // Una sola fila: la posición es la columna.
      if (c === undefined && r.length === 1) [f, c] = [1, f]
      c ??= anchoDe(r) === 1 ? 1 : 0
      if (f < 0 || c < 0) return error('#¡VALOR!')
      // 0 es toda la fila o la columna: sin arrays, solo sirve si es una celda.
      if (f === 0) f = r.length === 1 ? 1 : -1
      if (c === 0) c = anchoDe(r) === 1 ? 1 : -1
      return f < 0 || c < 0 ? error('#¡VALOR!') : celda(r, f, c)
    },
  },
  {
    nombre: 'FILAS',
    alias: ['ROWS'],
    minimo: 1,
    maximo: 1,
    categoria: 'Búsqueda',
    firma: 'FILAS(rango)',
    descripcion: 'La cantidad de filas de la tabla o columna.',
    ejemplo: 'FILAS(Causas)',
    evaluar: ([rango]) => {
      const r = rangoDe(rango)
      return 'tipo' in r ? r : numero(r.length)
    },
  },
  {
    nombre: 'COLUMNAS',
    alias: ['COLUMNS'],
    minimo: 1,
    maximo: 1,
    categoria: 'Búsqueda',
    firma: 'COLUMNAS(rango)',
    descripcion: 'La cantidad de columnas de la tabla.',
    ejemplo: 'COLUMNAS(Causas)',
    evaluar: ([rango]) => {
      const r = rangoDe(rango)
      return 'tipo' in r ? r : numero(anchoDe(r))
    },
  },
]

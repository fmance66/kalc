/**
 * Funciones que devuelven una tabla (arrays dinámicos de Excel 365): FILTRAR, ORDENAR, UNICOS,
 * ELEGIRCOLS, TOMAR. Una variable de tipo tabla puede ser una fórmula con ellas, y sirven como
 * argumento de otras (`FILAS(FILTRAR(…))`). Los ejemplos usan la tabla Causas de CONTEXTO_EJEMPLOS.
 */

import { aLogico, argEntero, rangoDe, resultado } from './comunes.ts'
import type { Argumento, DefinicionFuncion } from './registro.ts'
import { anchoDe, columnasDe, conColumnas, valorDeRango, type Rango } from '../tablas.ts'
import { comparar, error, esError, redondear15, VACIO, type Valor, type ValorError } from '../valores.ts'

/** Una función que devuelve un rango: como valor suelto, su única celda o #¡VALOR!. */
function deRango(def: Omit<DefinicionFuncion, 'evaluar' | 'evaluarRango'>, evaluarRango: (args: readonly Argumento[]) => Rango | ValorError): DefinicionFuncion {
  return {
    ...def,
    evaluarRango,
    evaluar: (args) => {
      const r = evaluarRango(args)
      return 'tipo' in r ? r : valorDeRango(r)
    },
  }
}

/** Las filas elegidas del rango, con los nombres de sus columnas. */
const filasDe = (r: Rango, filas: readonly (readonly Valor[])[]): Rango => conColumnas(filas, columnasDe(r))

/** Un argumento lógico opcional (VERDADERO/FALSO); omitido, `porDefecto`. */
function argLogico(a: Argumento | undefined, porDefecto: boolean): boolean | ValorError {
  return a ? aLogico(a()) : porDefecto
}

/** Orden de las celdas al ordenar: números (y fechas), textos, lógicos, errores; las vacías al final. */
function rangoDeOrden(v: Valor): number {
  switch (v.tipo) {
    case 'numero':
    case 'fecha':
      return 0
    case 'texto':
      return 1
    case 'logico':
      return 2
    case 'error':
      return 3
    case 'vacio':
      return 4
  }
}

/** Una fila como clave, para comparar sin distinguir mayúsculas (UNICOS). */
function clave(fila: readonly Valor[]): string {
  return JSON.stringify(
    fila.map((v) => {
      if (v.tipo === 'texto') return ['t', v.valor.toLocaleLowerCase('es')]
      if (v.tipo === 'numero' || v.tipo === 'fecha') return ['n', redondear15(v.valor)]
      return [v.tipo, 'valor' in v ? v.valor : null]
    }),
  )
}

export const MATRICES: DefinicionFuncion[] = [
  deRango(
    {
      nombre: 'FILTRAR',
      alias: ['FILTER'],
      minimo: 2,
      maximo: 3,
      categoria: 'Matrices',
      firma: 'FILTRAR(matriz; incluir; [si_vacío])',
      descripcion:
        'Las filas de la matriz en las que incluir es VERDADERO (una condición sobre una columna, del mismo largo). Si no queda ninguna, si_vacío (o #N/D; Excel da #¡CALC!).',
      ejemplo: 'FILTRAR(Causas; Causas[Fuero] = "Federal")',
    },
    ([matriz, incluir, siVacio]) => {
      const m = rangoDe(matriz)
      if ('tipo' in m) return m
      const inc = rangoDe(incluir)
      if ('tipo' in inc) return inc
      if (inc.length !== m.length || anchoDe(inc) !== 1) return error('#¡VALOR!')
      const elegidas: (readonly Valor[])[] = []
      for (const [i, fila] of m.entries()) {
        const v = inc[i]?.[0] ?? VACIO
        if (esError(v)) return v
        const b = aLogico(v)
        if (typeof b !== 'boolean') return b
        if (b) elegidas.push(fila)
      }
      if (elegidas.length > 0) return filasDe(m, elegidas)
      return siVacio ? [[resultado(siVacio)]] : error('#N/D')
    },
  ),
  deRango(
    {
      nombre: 'ORDENAR',
      alias: ['SORT'],
      minimo: 1,
      maximo: 3,
      categoria: 'Matrices',
      firma: 'ORDENAR(matriz; [columna]; [orden])',
      descripcion: 'Las filas ordenadas por una columna (desde 1; si falta, la primera). Orden 1 (si falta): ascendente; -1: descendente. Las vacías van al final.',
      ejemplo: 'ORDENAR(Causas; 3; -1)',
    },
    ([matriz, columna, orden]) => {
      const m = rangoDe(matriz)
      if ('tipo' in m) return m
      const c = columna ? argEntero(columna) : 1
      if (typeof c !== 'number') return c
      if (c < 1 || c > anchoDe(m)) return error('#¡VALOR!')
      const o = orden ? argEntero(orden) : 1
      if (typeof o !== 'number') return o
      if (o !== 1 && o !== -1) return error('#¡VALOR!')
      const ordenadas = [...m].sort((x, y) => {
        const a = x[c - 1] ?? VACIO
        const b = y[c - 1] ?? VACIO
        const ra = rangoDeOrden(a)
        const rb = rangoDeOrden(b)
        if (ra === 4 || rb === 4) return ra - rb // las vacías, al final en los dos órdenes
        return o * (ra !== rb ? ra - rb : comparar(a, b))
      })
      return filasDe(m, ordenadas)
    },
  ),
  deRango(
    {
      nombre: 'UNICOS',
      alias: ['UNIQUE'],
      minimo: 1,
      maximo: 3,
      categoria: 'Matrices',
      firma: 'UNICOS(matriz; [por_columna]; [solo_una_vez])',
      descripcion: 'Las filas sin repetir (sin distinguir mayúsculas), en el orden en que aparecen. Con solo_una_vez VERDADERO, las que aparecen una sola vez. Por columna no está.',
      ejemplo: 'UNICOS(Causas[Fuero])',
    },
    ([matriz, porColumna, soloUnaVez]) => {
      const m = rangoDe(matriz)
      if ('tipo' in m) return m
      const pc = argLogico(porColumna, false)
      if (typeof pc !== 'boolean') return pc
      if (pc) return error('#¡VALOR!')
      const una = argLogico(soloUnaVez, false)
      if (typeof una !== 'boolean') return una
      const veces = new Map<string, number>()
      for (const fila of m) veces.set(clave(fila), (veces.get(clave(fila)) ?? 0) + 1)
      const vistas = new Set<string>()
      const elegidas = m.filter((fila) => {
        const k = clave(fila)
        if (vistas.has(k) || (una && veces.get(k) !== 1)) return false
        vistas.add(k)
        return true
      })
      return elegidas.length > 0 ? filasDe(m, elegidas) : error('#N/D')
    },
  ),
  deRango(
    {
      nombre: 'ELEGIRCOLS',
      alias: ['CHOOSECOLS'],
      minimo: 2,
      maximo: 255,
      categoria: 'Matrices',
      firma: 'ELEGIRCOLS(matriz; columna1; [columna2]; …)',
      descripcion: 'Las columnas indicadas (desde 1; negativas, desde la última), en ese orden.',
      ejemplo: 'ELEGIRCOLS(Causas; 1; 3)',
    },
    ([matriz, ...columnas]) => {
      const m = rangoDe(matriz)
      if ('tipo' in m) return m
      const ancho = anchoDe(m)
      const indices: number[] = []
      for (const a of columnas) {
        const c = argEntero(a)
        if (typeof c !== 'number') return c
        if (c === 0 || Math.abs(c) > ancho) return error('#¡VALOR!')
        indices.push(c > 0 ? c - 1 : ancho + c)
      }
      const nombres = columnasDe(m)
      return conColumnas(
        m.map((fila) => indices.map((i) => fila[i] ?? VACIO)),
        indices.map((i) => nombres[i] as string),
      )
    },
  ),
  deRango(
    {
      nombre: 'TOMAR',
      alias: ['TAKE'],
      minimo: 2,
      maximo: 3,
      categoria: 'Matrices',
      firma: 'TOMAR(matriz; filas; [columnas])',
      descripcion: 'Las primeras filas (negativo: las últimas) y, si se indica, las primeras columnas. Con 0, #N/D (Excel da #¡CALC!).',
      ejemplo: 'TOMAR(ORDENAR(Causas; 3; -1); 2)',
    },
    ([matriz, filas, columnas]) => {
      const m = rangoDe(matriz)
      if ('tipo' in m) return m
      const f = argEntero(filas)
      if (typeof f !== 'number') return f
      const c = columnas ? argEntero(columnas) : anchoDe(m)
      if (typeof c !== 'number') return c
      if (f === 0 || c === 0) return error('#N/D')
      const recortar = <T>(xs: readonly T[], n: number) => (n > 0 ? xs.slice(0, n) : xs.slice(n))
      const nombres = recortar(columnasDe(m), c)
      return conColumnas(
        recortar(m, f).map((fila) => recortar(fila, c)),
        nombres,
      )
    },
  ),
]

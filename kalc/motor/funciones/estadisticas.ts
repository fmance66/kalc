/**
 * Conteos y sumas con condición: CONTAR, CONTARA, CONTAR.BLANCO, CONTAR.SI, CONTAR.SI.CONJUNTO,
 * SUMAR.SI, SUMAR.SI.CONJUNTO, PROMEDIO.SI. Las de condición trabajan sobre tablas y columnas
 * (`Ventas[Importe]`); los ejemplos usan la tabla Causas de CONTEXTO_EJEMPLOS.
 */

import { rangoDe, valoresDe } from './comunes.ts'
import { criterio, esVacia, type Criterio } from './criterios.ts'
import type { Argumento, DefinicionFuncion } from './registro.ts'
import { anchoDe, celdasDe, type Rango } from '../tablas.ts'
import { aNumero, error, esError, numero, VACIO, type Valor, type ValorError } from '../valores.ts'

/** Cuenta los valores de todos los argumentos que cumplen `cuenta` (con `celda`: si salen de una variable o rango). */
function contar(args: readonly Argumento[], cuenta: (v: Valor, celda: boolean) => boolean): Valor {
  let n = 0
  for (const a of args) {
    const r = valoresDe(a)
    // Un error en un valor no se cuenta ni se propaga (CONTAR(#N/D) da 0); pero si el rango no se
    // puede leer (una columna que no existe, la consulta pendiente), sí: si no, daría 0 sin avisar.
    if ('tipo' in r) return r
    for (const v of r.valores) if (cuenta(v, r.celdas)) n++
  }
  return numero(n)
}

/** Un rango y su criterio: `CONTAR.SI(rango; criterio)`, y los pares de las .CONJUNTO. */
interface Condicion {
  rango: Rango
  cumple: Criterio
}

function condicion(rango: Argumento | undefined, crit: Argumento | undefined): Condicion | ValorError {
  const r = rangoDe(rango)
  if ('tipo' in r) return r
  return { rango: r, cumple: criterio(crit?.() ?? VACIO) }
}

/**
 * Las condiciones de a pares (`rango1; criterio1; rango2; criterio2…`). Como en Excel, todos los
 * rangos tienen que tener el mismo tamaño: si no, #¡VALOR!.
 */
function condiciones(args: readonly Argumento[], alto?: number, ancho?: number): Condicion[] | ValorError {
  if (args.length % 2 !== 0) return error('#¡VALOR!')
  const r: Condicion[] = []
  for (let i = 0; i < args.length; i += 2) {
    const c = condicion(args[i], args[i + 1])
    if ('tipo' in c) return c
    if ((alto ?? c.rango.length) !== c.rango.length || (ancho ?? anchoDe(c.rango)) !== anchoDe(c.rango)) return error('#¡VALOR!')
    alto = c.rango.length
    ancho = anchoDe(c.rango)
    r.push(c)
  }
  return r
}

/** Las posiciones (fila, columna) donde se cumplen todas las condiciones. */
function* coincidencias(conds: readonly Condicion[]): Generator<[number, number]> {
  const [primera] = conds
  if (!primera) return
  for (let i = 0; i < primera.rango.length; i++) {
    for (let j = 0; j < anchoDe(primera.rango); j++) {
      if (conds.every((c) => c.cumple(c.rango[i]?.[j] ?? VACIO))) yield [i, j]
    }
  }
}

/**
 * Los números de `rango` en las posiciones que cumplen: solo cuentan números y fechas (como en
 * Excel, el texto se ignora) y un error en una celda que cumple se propaga. Si `rango` es más chico,
 * lo que queda afuera se ignora.
 */
function numerosQueCumplen(rango: Rango, conds: readonly Condicion[]): number[] | ValorError {
  const r: number[] = []
  for (const [i, j] of coincidencias(conds)) {
    const v = rango[i]?.[j] ?? VACIO
    if (esError(v)) return v
    if (v.tipo === 'numero' || v.tipo === 'fecha') r.push(v.valor)
  }
  return r
}

const sumar = (ns: readonly number[]) => ns.reduce((s, n) => s + n, 0)

export const ESTADISTICAS: DefinicionFuncion[] = [
  {
    nombre: 'CONTAR',
    alias: ['COUNT'],
    minimo: 1,
    maximo: 255,
    categoria: 'Estadísticas',
    firma: 'CONTAR(valor1; [valor2]; …)',
    descripcion: 'Cuántos números hay. De una tabla, columna o variable cuentan solo los números y las fechas; escrito directo, también "3" y VERDADERO. Los errores no se cuentan.',
    ejemplo: 'CONTAR(Causas[Fojas])',
    evaluar: (args) =>
      contar(args, (v, celda) => {
        if (v.tipo === 'numero' || v.tipo === 'fecha') return true
        return !celda && !esError(v) && typeof aNumero(v) === 'number'
      }),
  },
  {
    nombre: 'CONTARA',
    alias: ['COUNTA'],
    minimo: 1,
    maximo: 255,
    categoria: 'Estadísticas',
    firma: 'CONTARA(valor1; [valor2]; …)',
    descripcion: 'Cuántos valores no vacíos hay (números, textos, lógicos y errores).',
    ejemplo: 'CONTARA(Causas[Causa])',
    evaluar: (args) => contar(args, (v, celda) => !celda || v.tipo !== 'vacio'),
  },
  {
    nombre: 'CONTAR.BLANCO',
    alias: ['COUNTBLANK'],
    minimo: 1,
    maximo: 1,
    categoria: 'Estadísticas',
    firma: 'CONTAR.BLANCO(rango)',
    descripcion: 'Cuántas celdas vacías hay en el rango (también las de texto vacío).',
    ejemplo: 'CONTAR.BLANCO(Causas[Fojas])',
    evaluar: ([rango]) => {
      const r = rangoDe(rango)
      return 'tipo' in r ? r : numero(celdasDe(r).filter(esVacia).length)
    },
  },
  {
    nombre: 'CONTAR.SI',
    alias: ['COUNTIF'],
    minimo: 2,
    maximo: 2,
    categoria: 'Estadísticas',
    firma: 'CONTAR.SI(rango; criterio)',
    descripcion: 'Cuántas celdas del rango cumplen el criterio: un valor, o un texto con operador (">100", "<>Baja") o comodines ("A*").',
    ejemplo: 'CONTAR.SI(Causas[Fuero]; "Criminal")',
    evaluar: (args) => {
      const conds = condiciones(args)
      return 'tipo' in conds ? conds : numero([...coincidencias(conds)].length)
    },
  },
  {
    nombre: 'CONTAR.SI.CONJUNTO',
    alias: ['COUNTIFS'],
    minimo: 2,
    maximo: 254,
    categoria: 'Estadísticas',
    firma: 'CONTAR.SI.CONJUNTO(rango1; criterio1; [rango2; criterio2]; …)',
    descripcion: 'Cuántas filas cumplen todos los criterios, cada uno en su rango. Los rangos tienen que ser del mismo tamaño.',
    ejemplo: 'CONTAR.SI.CONJUNTO(Causas[Fuero]; "Federal"; Causas[Monto]; ">500000")',
    evaluar: (args) => {
      const conds = condiciones(args)
      return 'tipo' in conds ? conds : numero([...coincidencias(conds)].length)
    },
  },
  {
    nombre: 'SUMAR.SI',
    alias: ['SUMIF'],
    minimo: 2,
    maximo: 3,
    categoria: 'Estadísticas',
    firma: 'SUMAR.SI(rango; criterio; [rango_suma])',
    descripcion: 'Suma las celdas de rango_suma (o del rango, si falta) en las filas donde el rango cumple el criterio.',
    ejemplo: 'SUMAR.SI(Causas[Fuero]; "Criminal"; Causas[Monto])',
    evaluar: ([rango, crit, rangoSuma]) => {
      const c = condicion(rango, crit)
      if ('tipo' in c) return c
      const suma = rangoSuma ? rangoDe(rangoSuma) : c.rango
      if ('tipo' in suma) return suma
      const ns = numerosQueCumplen(suma, [c])
      return 'tipo' in ns ? ns : numero(sumar(ns))
    },
  },
  {
    nombre: 'SUMAR.SI.CONJUNTO',
    alias: ['SUMIFS'],
    minimo: 3,
    maximo: 255,
    categoria: 'Estadísticas',
    firma: 'SUMAR.SI.CONJUNTO(rango_suma; rango1; criterio1; [rango2; criterio2]; …)',
    descripcion: 'Suma las celdas de rango_suma en las filas que cumplen todos los criterios. Todos los rangos, del mismo tamaño.',
    ejemplo: 'SUMAR.SI.CONJUNTO(Causas[Fojas]; Causas[Monto]; "<500000"; Causas[Fuero]; "<>Penal Económico")',
    evaluar: ([rangoSuma, ...resto]) => {
      const suma = rangoDe(rangoSuma)
      if ('tipo' in suma) return suma
      const conds = condiciones(resto, suma.length, anchoDe(suma))
      if ('tipo' in conds) return conds
      const ns = numerosQueCumplen(suma, conds)
      return 'tipo' in ns ? ns : numero(sumar(ns))
    },
  },
  {
    nombre: 'PROMEDIO.SI',
    alias: ['AVERAGEIF'],
    minimo: 2,
    maximo: 3,
    categoria: 'Estadísticas',
    firma: 'PROMEDIO.SI(rango; criterio; [rango_promedio])',
    descripcion: 'El promedio de las celdas de rango_promedio (o del rango) en las filas que cumplen el criterio. Sin ninguna, #¡DIV/0!.',
    ejemplo: 'PROMEDIO.SI(Causas[Fuero]; "P*"; Causas[Monto])',
    evaluar: ([rango, crit, rangoPromedio]) => {
      const c = condicion(rango, crit)
      if ('tipo' in c) return c
      const datos = rangoPromedio ? rangoDe(rangoPromedio) : c.rango
      if ('tipo' in datos) return datos
      const ns = numerosQueCumplen(datos, [c])
      if ('tipo' in ns) return ns
      return ns.length === 0 ? error('#¡DIV/0!') : numero(sumar(ns) / ns.length)
    },
  },
]

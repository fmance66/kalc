/**
 * Árbol + contexto → Valor, con las reglas de Excel: coerciones, propagación del primer error,
 * comparación entre tipos y cortocircuito (las funciones reciben los argumentos sin evaluar).
 *
 * Arrays dinámicos, como Excel 365: una tabla, una columna o una función como FILTRAR dan un rango,
 * y las operaciones con un rango (`Ventas[Importe] * 2`, `Ventas[Estado] = 2`) van celda por celda.
 * Como argumento de SUMA, CONTAR.SI, etc., el rango se lee entero; como valor suelto, da #¡VALOR!
 * (salvo una sola celda), y `evaluarComoTabla` lo devuelve como tabla.
 */

import type { Nodo, OperadorBinario } from './ast.ts'
import { aTabla, columnaDe, conColumnas, rangoDeTabla, valorDeRango, type Rango, type Tabla } from './tablas.ts'
import { potencia } from './funciones/comunes.ts'
import { buscarFuncion, type Argumento } from './funciones/registro.ts'
import { ErrorSintaxis } from './lexer.ts'
import { parsear } from './parser.ts'
import {
  aNumero,
  aTexto,
  comparar,
  error,
  esError,
  esTextoFecha,
  fecha,
  LARGO_MAXIMO_TEXTO,
  logico,
  numero,
  texto,
  VACIO,
  type Valor,
  type ValorError,
} from './valores.ts'

export interface Contexto {
  /** Valores de las variables por nombre (sin distinguir mayúsculas), o una función que los busca. */
  variables?: Readonly<Record<string, Valor>> | ((nombre: string) => Valor | undefined)
  /** Las tablas por nombre (sin distinguir mayúsculas), o una función que las busca: `Ventas[Importe]`. */
  tablas?: Readonly<Record<string, Tabla>> | ((nombre: string) => Tabla | undefined)
  /**
   * En una columna calculada, la fila que se está calculando: `[@Alta]` es su celda de la columna
   * Alta (`undefined` si no existe). Sin esto, `[@Alta]` da #¡VALOR!, como en Excel fuera de la tabla.
   */
  fila?: (columna: string) => Valor | undefined
}

/** El contexto listo para buscar por nombre. */
interface Entorno {
  variable: (nombre: string) => Valor | undefined
  tabla: (nombre: string) => Tabla | undefined
  fila: ((columna: string) => Valor | undefined) | undefined
}

const entorno = (c: Contexto): Entorno => ({ variable: buscador(c.variables), tabla: buscador(c.tablas), fila: c.fila })

const esRango = (x: Valor | Rango): x is Rango => Array.isArray(x)

/**
 * Evalúa el texto de una fórmula. Si tiene un error de sintaxis lanza `ErrorSintaxis` (Excel no
 * deja ni escribirla); para mostrar el error con su posición, usar `parsear`.
 */
export function evaluar(formula: string, contexto: Contexto = {}): Valor {
  const r = parsear(formula)
  if (!r.ok) throw new ErrorSintaxis(r.error.mensaje, r.error)
  return evaluarArbol(r.arbol, contexto)
}

/** Evalúa un árbol ya parseado. Una fórmula nunca da "vacío": como en Excel, `=A` con A vacía da 0. */
export function evaluarArbol(arbol: Nodo, contexto: Contexto = {}): Valor {
  const v = evaluarNodo(arbol, entorno(contexto))
  return v.tipo === 'vacio' ? numero(0) : v
}

/**
 * Evalúa un árbol que puede dar una tabla (`FILTRAR(Ventas; Ventas[Estado] = 2)`, `Ventas[Importe] * 2`):
 * la tabla, con los nombres de las columnas si salen de una; o el valor, si la fórmula da uno solo.
 */
export function evaluarComoTabla(arbol: Nodo, contexto: Contexto = {}): Tabla | Valor {
  const e = entorno(contexto)
  if (!esDeRango(arbol, e)) return evaluarArbol(arbol, contexto)
  const r = evaluarMatriz(arbol, e)
  if (!esRango(r)) return r.tipo === 'vacio' ? numero(0) : r
  return aTabla(r)
}

function buscador<T>(fuente: Readonly<Record<string, T>> | ((nombre: string) => T | undefined) | undefined): (nombre: string) => T | undefined {
  if (!fuente) return () => undefined
  if (typeof fuente === 'function') return fuente
  const porNombre = new Map(Object.entries(fuente).map(([k, v]) => [k.toLowerCase(), v]))
  return (nombre) => porNombre.get(nombre.toLowerCase())
}

/**
 * El rango de una referencia a una tabla (`Ventas`) o a una de sus columnas (`Ventas[Importe]`);
 * `undefined` si es una variable común. Una columna de algo que no es una tabla: si es una consulta
 * pendiente o con error, ese error; si es otra variable, #¡REF!; si no existe, #¿NOMBRE?.
 */
function rangoDe(n: Extract<Nodo, { clase: 'referencia' }>, e: Entorno): Rango | ValorError | undefined {
  if (n.filaActual) return undefined
  const tabla = e.tabla(n.nombre)
  if (tabla) return n.columna === undefined ? rangoDeTabla(tabla) : columnaDe(tabla, n.columna)
  if (n.columna === undefined) return undefined
  const v = e.variable(n.nombre)
  if (!v) return error('#¿NOMBRE?')
  return esError(v) ? v : error('#¡REF!')
}

/**
 * Si el nodo da un rango: una tabla o columna, una función que devuelve tablas (FILTRAR), una
 * función de un valor que recibe un rango (`MAYUSC(Ventas[Cliente])`), o una operación con alguno
 * de esos. Se decide sin evaluar, por la forma de la fórmula.
 */
function esDeRango(n: Nodo, e: Entorno): boolean {
  switch (n.clase) {
    case 'referencia':
      return rangoDe(n, e) !== undefined
    case 'unario':
    case 'porcentaje':
      return esDeRango(n.operando, e)
    case 'binario':
      return esDeRango(n.izquierda, e) || esDeRango(n.derecha, e)
    case 'llamada':
      return buscarFuncion(n.nombre)?.evaluarRango !== undefined || esPorCelda(n, e)
    default:
      return false
  }
}

/** Una función de un valor (`porCelda`) con algún argumento que es un rango: se aplica celda por celda. */
function esPorCelda(n: Extract<Nodo, { clase: 'llamada' }>, e: Entorno): boolean {
  const f = buscarFuncion(n.nombre)
  return f?.porCelda === true && f.evaluarRango === undefined && n.argumentos.some((a) => esDeRango(a, e))
}

/** Un nodo que puede dar un rango: el rango, o un valor (un error, o una parte que no es rango). */
function evaluarMatriz(n: Nodo, e: Entorno): Valor | Rango {
  switch (n.clase) {
    case 'referencia':
      return rangoDe(n, e) ?? evaluarNodo(n, e)
    case 'unario': {
      const op = n.operador
      return celdaPorCelda(evaluarMatriz(n.operando, e), (v) => unario(op, v))
    }
    case 'porcentaje':
      return celdaPorCelda(evaluarMatriz(n.operando, e), porcentaje)
    case 'binario': {
      const op = n.operador
      return entreRangos(evaluarMatriz(n.izquierda, e), evaluarMatriz(n.derecha, e), (a, b) => binario(op, a, b))
    }
    case 'llamada': {
      const f = buscarFuncion(n.nombre)
      if (f && esPorCelda(n, e)) {
        if (n.argumentos.length < f.minimo || n.argumentos.length > f.maximo) return error('#¡VALOR!')
        // Cada argumento se evalúa una vez, entero; la función recibe, en cada celda, los valores
        // de esa celda (los que no son rangos, repetidos).
        const valores = n.argumentos.map((a) => (esDeRango(a, e) ? evaluarMatriz(a, e) : evaluarNodo(a, e)))
        return entreVarios(valores, (celdas) =>
          f.evaluar(celdas.map((v, k) => Object.assign(() => v, { referencia: esRango(valores[k] as Valor | Rango) }))),
        )
      }
      if (!f?.evaluarRango) return evaluarNodo(n, e)
      if (n.argumentos.length < f.minimo || n.argumentos.length > f.maximo) return error('#¡VALOR!')
      return f.evaluarRango(argumentos(n, e))
    }
    default:
      return evaluarNodo(n, e)
  }
}

function celdaPorCelda(x: Valor | Rango, f: (v: Valor) => Valor): Valor | Rango {
  return esRango(x) ? conColumnas(x.map((fila) => fila.map(f)), []) : f(x)
}

/** Una operación entre dos rangos (o un rango y un valor), celda por celda: ver `entreVarios`. */
function entreRangos(a: Valor | Rango, b: Valor | Rango, f: (x: Valor, y: Valor) => Valor): Valor | Rango {
  return entreVarios([a, b], ([x, y]) => f(x as Valor, y as Valor))
}

/**
 * Una operación entre rangos (o rangos y valores), celda por celda, como Excel 365: un valor se
 * repite en todas las celdas, una sola fila o columna se repite en las demás, y si los tamaños no
 * coinciden, lo que sobra da #N/D. Sin ningún rango, la operación con los valores.
 */
function entreVarios(xs: readonly (Valor | Rango)[], f: (celdas: Valor[]) => Valor): Valor | Rango {
  if (!xs.some(esRango)) return f(xs as Valor[])
  const rangos: Rango[] = xs.map((x) => (esRango(x) ? x : [[x]]))
  const alto = Math.max(...rangos.map((r) => r.length))
  const ancho = Math.max(...rangos.map((r) => r[0]?.length ?? 0))
  const celda = (r: Rango, i: number, j: number): Valor => {
    const fi = r.length === 1 ? 0 : i
    const cj = (r[0]?.length ?? 0) === 1 ? 0 : j
    return r[fi]?.[cj] ?? error('#N/D')
  }
  const filas = Array.from({ length: alto }, (_, i) => Array.from({ length: ancho }, (_, j) => f(rangos.map((r) => celda(r, i, j)))))
  return conColumnas(filas, [])
}

/** Los argumentos sin evaluar: si son una variable sola, o un rango (con sus celdas). */
function argumentos(n: Extract<Nodo, { clase: 'llamada' }>, e: Entorno): Argumento[] {
  // Se marca si el argumento es una variable: Excel trata distinto `SUMA(A)` (con A = "3", lo
  // ignora, como una celda con texto) que `SUMA("3")` (lo convierte). Si es una tabla, una columna
  // o una operación con ellas, lleva además sus celdas, para las funciones que aceptan rangos.
  return n.argumentos.map((a): Argumento => {
    const evaluarlo = () => evaluarNodo(a, e)
    const referencia = a.clase === 'referencia'
    if (!esDeRango(a, e)) return Object.assign(evaluarlo, { referencia })
    const rango = (): Rango | ValorError => {
      const r = evaluarMatriz(a, e)
      if (esRango(r)) return r
      return esError(r) ? r : [[r]]
    }
    return Object.assign(evaluarlo, { referencia, rango })
  })
}

function evaluarNodo(n: Nodo, e: Entorno): Valor {
  // Una operación con un rango, como valor suelto: una celda, o #¡VALOR!.
  if ((n.clase === 'unario' || n.clase === 'porcentaje' || n.clase === 'binario' || n.clase === 'llamada') && esDeRango(n, e)) {
    const r = evaluarMatriz(n, e)
    return esRango(r) ? valorDeRango(r) : r
  }
  switch (n.clase) {
    case 'numero':
      return numero(n.valor)
    case 'texto':
      return texto(n.valor)
    case 'logico':
      return logico(n.valor)
    case 'error':
      return error(n.valor)
    case 'omitido':
      return VACIO
    case 'referencia': {
      if (n.filaActual) {
        // Fuera de una columna calculada no hay fila: #¡VALOR!, como en Excel fuera de la tabla.
        if (!e.fila) return error('#¡VALOR!')
        return e.fila(n.columna ?? '') ?? error('#¡REF!')
      }
      const r = rangoDe(n, e)
      if (r === undefined) return e.variable(n.nombre) ?? error('#¿NOMBRE?')
      return 'tipo' in r ? r : valorDeRango(r)
    }
    case 'unario':
      return unario(n.operador, evaluarNodo(n.operando, e))
    case 'porcentaje':
      return porcentaje(evaluarNodo(n.operando, e))
    case 'binario':
      return binario(n.operador, evaluarNodo(n.izquierda, e), evaluarNodo(n.derecha, e))
    case 'llamada': {
      const f = buscarFuncion(n.nombre)
      if (!f) return error('#¿NOMBRE?')
      // Excel ni deja escribir una función con argumentos de más o de menos.
      if (n.argumentos.length < f.minimo || n.argumentos.length > f.maximo) return error('#¡VALOR!')
      return f.evaluar(argumentos(n, e))
    }
  }
}

function unario(op: '-' | '+', v: Valor): Valor {
  // Excel ignora el + unario: =+"abc" da "abc", sin convertir.
  if (op === '+') return v
  const x = aNumero(v)
  return typeof x === 'number' ? numero(-x) : x
}

function porcentaje(v: Valor): Valor {
  const x = aNumero(v)
  return typeof x === 'number' ? numero(x / 100) : x
}

function binario(op: OperadorBinario, a: Valor, b: Valor): Valor {
  // El primer error, en orden de evaluación (izquierda antes que derecha).
  if (esError(a)) return a
  if (esError(b)) return b
  switch (op) {
    case '&': {
      const x = aTexto(a)
      if (typeof x !== 'string') return x
      const y = aTexto(b)
      if (typeof y !== 'string') return y
      return x.length + y.length > LARGO_MAXIMO_TEXTO ? error('#¡VALOR!') : texto(x + y)
    }
    case '=':
    case '<>':
    case '<':
    case '>':
    case '<=':
    case '>=':
      return logico(compararCon(op, comparar(a, b)))
    default:
      return aritmetica(op, a, b)
  }
}

function aritmetica(op: '+' | '-' | '*' | '/' | '^', a: Valor, b: Valor): Valor {
  const x = aNumero(a)
  if (typeof x !== 'number') return x
  const y = aNumero(b)
  if (typeof y !== 'number') return y
  let r: number
  switch (op) {
    case '+':
      r = x + y
      break
    case '-':
      r = x - y
      break
    case '*':
      r = x * y
      break
    case '/':
      if (y === 0) return error('#¡DIV/0!')
      r = x / y
      break
    case '^':
      return potencia(x, y)
  }
  // Desborde (1E+308*10) o raíz de un negativo ((-8)^(1/3)).
  if (!Number.isFinite(r)) return error('#¡NUM!')
  return tipoFecha(op, a, b) ? fecha(r) : numero(r)
}

/**
 * Excel le pone formato de fecha al resultado de `fecha + n` y `fecha - n` (el día siguiente, el
 * anterior); `fecha2 - fecha1` es una cantidad de días. Un texto escrito como fecha cuenta como
 * fecha del otro lado (`F - "1/1/2026"` da días), pero por sí solo no da una fecha: `"1/3/1900" + 0`
 * da 61.
 */
function tipoFecha(op: string, a: Valor, b: Valor): boolean {
  const comoFecha = (v: Valor) => v.tipo === 'fecha' || (v.tipo === 'texto' && esTextoFecha(v.valor))
  if (op === '+') return (a.tipo === 'fecha' && !comoFecha(b)) || (b.tipo === 'fecha' && !comoFecha(a))
  if (op === '-') return a.tipo === 'fecha' && !comoFecha(b)
  return false
}

function compararCon(op: '=' | '<>' | '<' | '>' | '<=' | '>=', c: number): boolean {
  switch (op) {
    case '=':
      return c === 0
    case '<>':
      return c !== 0
    case '<':
      return c < 0
    case '>':
      return c > 0
    case '<=':
      return c <= 0
    case '>=':
      return c >= 0
  }
}

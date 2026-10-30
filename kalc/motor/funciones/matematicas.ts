/**
 * Matemáticas y trigonométricas: SUMA, PROMEDIO, MIN, MAX, redondeos, ENTERO, ABS, RESIDUO,
 * POTENCIA, RAIZ, logaritmos, EXP, PI y las trigonométricas (en radianes, como en Excel).
 */

import { argNumero, numerosDe, potencia, redondearA, type ModoRedondeo } from './comunes.ts'
import type { Argumento, DefinicionFuncion } from './registro.ts'
import { error, fecha, numero, redondear15, type Valor } from '../valores.ts'

/** Una función de un número: `ABS(x)`. */
function conNumero(a: Argumento | undefined, f: (x: number) => Valor): Valor {
  const x = argNumero(a)
  return typeof x === 'number' ? f(x) : x
}

function redondeo(modo: ModoRedondeo, digitosPorDefecto?: number) {
  return ([n, d]: readonly Argumento[]): Valor => {
    const x = argNumero(n)
    if (typeof x !== 'number') return x
    const digitos = d ? argNumero(d) : (digitosPorDefecto ?? 0)
    if (typeof digitos !== 'number') return digitos
    return numero(redondearA(x, digitos, modo))
  }
}

/** Un número o, si no lo es (raíz de un negativo, desborde), #¡NUM! como en Excel. */
function real(x: number): Valor {
  return Number.isFinite(x) ? numero(x) : error('#¡NUM!')
}

/** Una función de un número con resultado real: `RAIZ(x)`, `ASENO(x)`. */
function deReal(f: (x: number) => number) {
  return ([a]: readonly Argumento[]): Valor => conNumero(a, (x) => real(f(x)))
}

/** Excel no calcula SENO, COS ni TAN de 2^27 o más: da #¡NUM!. */
const LIMITE_TRIGONOMETRICO = 2 ** 27

function trigonometrica(f: (x: number) => number) {
  return ([a]: readonly Argumento[]): Valor =>
    conNumero(a, (x) => (Math.abs(x) >= LIMITE_TRIGONOMETRICO ? error('#¡NUM!') : real(f(x))))
}

/**
 * Logaritmo en cualquier base. Las bases 10 y 2 con las de JavaScript, que son exactas:
 * Math.log(1000) / Math.log(10) da 2,9999999999999996 y ENTERO lo vería como 2.
 */
function logaritmo(x: number, base: number): Valor {
  if (x <= 0 || base <= 0) return error('#¡NUM!')
  if (base === 1) return error('#¡DIV/0!')
  if (base === 10) return numero(Math.log10(x))
  if (base === 2) return numero(Math.log2(x))
  return numero(Math.log(x) / Math.log(base))
}

/** MIN y MAX: sin números da 0. Si todos eran fechas, el resultado también (como el formato de Excel). */
function extremo(args: readonly Argumento[], elegir: (...n: number[]) => number): Valor {
  const r = numerosDe(args)
  if ('tipo' in r) return r
  if (r.numeros.length === 0) return numero(0)
  const x = elegir(...r.numeros)
  return r.fechas ? fecha(x) : numero(x)
}

export const MATEMATICAS: DefinicionFuncion[] = [
  {
    nombre: 'SUMA',
    alias: ['SUM'],
    minimo: 1,
    maximo: 255,
    categoria: 'Matemáticas',
    firma: 'SUMA(número1; [número2]; …)',
    descripcion: 'La suma de los argumentos. De una variable solo cuentan números y fechas; escrito directo, "3" y VERDADERO se convierten.',
    ejemplo: 'SUMA(1; 2,5; "3"; VERDADERO)',
    evaluar: (args) => {
      const r = numerosDe(args)
      return 'tipo' in r ? r : numero(r.numeros.reduce((s, n) => s + n, 0))
    },
  },
  {
    nombre: 'PROMEDIO',
    alias: ['AVERAGE'],
    minimo: 1,
    maximo: 255,
    categoria: 'Matemáticas',
    firma: 'PROMEDIO(número1; [número2]; …)',
    descripcion: 'El promedio de los números (con las mismas reglas que SUMA). Sin ningún número, #¡DIV/0!.',
    ejemplo: 'PROMEDIO(2; 4; 9)',
    evaluar: (args) => {
      const r = numerosDe(args)
      if ('tipo' in r) return r
      if (r.numeros.length === 0) return error('#¡DIV/0!')
      return numero(r.numeros.reduce((s, n) => s + n, 0) / r.numeros.length)
    },
  },
  {
    nombre: 'MIN',
    minimo: 1,
    maximo: 255,
    categoria: 'Matemáticas',
    firma: 'MIN(número1; [número2]; …)',
    descripcion: 'El menor de los números; 0 si no hay ninguno.',
    ejemplo: 'MIN(5; -2; 8)',
    evaluar: (args) => extremo(args, Math.min),
  },
  {
    nombre: 'MAX',
    minimo: 1,
    maximo: 255,
    categoria: 'Matemáticas',
    firma: 'MAX(número1; [número2]; …)',
    descripcion: 'El mayor de los números; 0 si no hay ninguno.',
    ejemplo: 'MAX(5; -2; 8)',
    evaluar: (args) => extremo(args, Math.max),
  },
  {
    nombre: 'REDONDEAR',
    alias: ['ROUND'],
    minimo: 2,
    maximo: 2,
    categoria: 'Matemáticas',
    firma: 'REDONDEAR(número; decimales)',
    descripcion: 'Redondea a esa cantidad de decimales (negativa: a decenas, centenas…). La mitad se aleja del cero: -2,5 da -3.',
    ejemplo: 'REDONDEAR(2,675; 2)',
    evaluar: redondeo('mitad'),
  },
  {
    nombre: 'REDONDEAR.MAS',
    alias: ['ROUNDUP'],
    minimo: 2,
    maximo: 2,
    categoria: 'Matemáticas',
    firma: 'REDONDEAR.MAS(número; decimales)',
    descripcion: 'Redondea alejándose del cero.',
    ejemplo: 'REDONDEAR.MAS(-3,141; 1)',
    evaluar: redondeo('afuera'),
  },
  {
    nombre: 'REDONDEAR.MENOS',
    alias: ['ROUNDDOWN'],
    minimo: 2,
    maximo: 2,
    categoria: 'Matemáticas',
    firma: 'REDONDEAR.MENOS(número; decimales)',
    descripcion: 'Redondea acercándose al cero (corta los decimales).',
    ejemplo: 'REDONDEAR.MENOS(-3,149; 1)',
    evaluar: redondeo('adentro'),
  },
  {
    nombre: 'TRUNCAR',
    alias: ['TRUNC'],
    minimo: 1,
    maximo: 2,
    categoria: 'Matemáticas',
    firma: 'TRUNCAR(número; [decimales])',
    descripcion: 'Corta los decimales sin redondear (por defecto, todos).',
    ejemplo: 'TRUNCAR(-8,9)',
    evaluar: redondeo('adentro', 0),
  },
  {
    nombre: 'ENTERO',
    alias: ['INT'],
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'ENTERO(número)',
    descripcion: 'Redondea hacia abajo al entero: con negativos no es lo mismo que TRUNCAR (ENTERO(-8,9) = -9).',
    ejemplo: 'ENTERO(-8,9)',
    // A 15 dígitos, como los ve Excel: (0,1+0,7)*10 es 7,999999999999999 pero se ve 8.
    evaluar: ([a]) => conNumero(a, (x) => numero(Math.floor(redondear15(x)))),
  },
  {
    nombre: 'ABS',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'ABS(número)',
    descripcion: 'El valor absoluto (sin signo).',
    ejemplo: 'ABS(-12,5)',
    evaluar: ([a]) => conNumero(a, (x) => numero(Math.abs(x))),
  },
  {
    nombre: 'RESIDUO',
    alias: ['MOD'],
    minimo: 2,
    maximo: 2,
    categoria: 'Matemáticas',
    firma: 'RESIDUO(número; divisor)',
    descripcion: 'El resto de la división. Tiene el signo del divisor: RESIDUO(-3; 2) = 1.',
    ejemplo: 'RESIDUO(-3; 2)',
    evaluar: ([n, d]) => {
      const x = argNumero(n)
      if (typeof x !== 'number') return x
      const y = argNumero(d)
      if (typeof y !== 'number') return y
      if (y === 0) return error('#¡DIV/0!')
      // La definición de Excel: n - d*ENTERO(n/d).
      const r = x - y * Math.floor(redondear15(x / y))
      // Lo que queda de los errores binarios (RESIDUO(0,3;0,1) daría -5,55E-17) es 0.
      return numero(Math.abs(r) < Math.abs(y) * 1e-14 ? 0 : r)
    },
  },
  {
    nombre: 'POTENCIA',
    alias: ['POWER'],
    minimo: 2,
    maximo: 2,
    categoria: 'Matemáticas',
    firma: 'POTENCIA(número; potencia)',
    descripcion: 'Lo mismo que el operador ^.',
    ejemplo: 'POTENCIA(2; 10)',
    evaluar: ([b, e]) => {
      const x = argNumero(b)
      if (typeof x !== 'number') return x
      const y = argNumero(e)
      return typeof y === 'number' ? potencia(x, y) : y
    },
  },
  {
    nombre: 'RAIZ',
    alias: ['SQRT'],
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'RAIZ(número)',
    descripcion: 'La raíz cuadrada. De un negativo, #¡NUM!.',
    ejemplo: 'RAIZ(16)',
    evaluar: deReal(Math.sqrt),
  },
  {
    nombre: 'EXP',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'EXP(número)',
    descripcion: 'e (2,71828…) elevado al número. Si el resultado es demasiado grande, #¡NUM!.',
    ejemplo: 'EXP(1)',
    evaluar: deReal(Math.exp),
  },
  {
    nombre: 'LN',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'LN(número)',
    descripcion: 'El logaritmo natural (en base e). De cero o un negativo, #¡NUM!.',
    ejemplo: 'LN(EXP(2))',
    evaluar: deReal(Math.log),
  },
  {
    nombre: 'LOG10',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'LOG10(número)',
    descripcion: 'El logaritmo en base 10. De cero o un negativo, #¡NUM!.',
    ejemplo: 'LOG10(1000)',
    evaluar: ([a]) => conNumero(a, (x) => logaritmo(x, 10)),
  },
  {
    nombre: 'LOG',
    minimo: 1,
    maximo: 2,
    categoria: 'Matemáticas',
    firma: 'LOG(número; [base])',
    descripcion: 'El logaritmo en esa base (por defecto, 10). Con base 1, #¡DIV/0!; con número o base de cero o menos, #¡NUM!.',
    ejemplo: 'LOG(8; 2)',
    evaluar: ([n, b]) => {
      const x = argNumero(n)
      if (typeof x !== 'number') return x
      const base = b ? argNumero(b) : 10
      return typeof base === 'number' ? logaritmo(x, base) : base
    },
  },
  {
    nombre: 'PI',
    minimo: 0,
    maximo: 0,
    categoria: 'Matemáticas',
    firma: 'PI()',
    descripcion: 'El número π (3,14159265358979).',
    ejemplo: 'PI()',
    evaluar: () => numero(Math.PI),
  },
  {
    nombre: 'RADIANES',
    alias: ['RADIANS'],
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'RADIANES(grados)',
    descripcion: 'Pasa de grados a radianes, que es lo que usan SENO, COS y TAN.',
    ejemplo: 'RADIANES(180)',
    evaluar: ([a]) => conNumero(a, (x) => numero((x * Math.PI) / 180)),
  },
  {
    nombre: 'GRADOS',
    alias: ['DEGREES'],
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'GRADOS(radianes)',
    descripcion: 'Pasa de radianes a grados.',
    ejemplo: 'GRADOS(PI())',
    evaluar: ([a]) => conNumero(a, (x) => numero((x * 180) / Math.PI)),
  },
  {
    nombre: 'SENO',
    alias: ['SIN'],
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'SENO(radianes)',
    descripcion: 'El seno de un ángulo en radianes (en grados: SENO(RADIANES(30))).',
    ejemplo: 'SENO(RADIANES(30))',
    evaluar: trigonometrica(Math.sin),
  },
  {
    nombre: 'COS',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'COS(radianes)',
    descripcion: 'El coseno de un ángulo en radianes.',
    ejemplo: 'COS(PI())',
    evaluar: trigonometrica(Math.cos),
  },
  {
    nombre: 'TAN',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'TAN(radianes)',
    descripcion: 'La tangente de un ángulo en radianes.',
    ejemplo: 'TAN(RADIANES(45))',
    evaluar: trigonometrica(Math.tan),
  },
  {
    nombre: 'ASENO',
    alias: ['ASIN'],
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'ASENO(número)',
    descripcion: 'El arco seno, en radianes (entre -π/2 y π/2). Fuera de -1 a 1, #¡NUM!.',
    ejemplo: 'GRADOS(ASENO(0,5))',
    evaluar: deReal(Math.asin),
  },
  {
    nombre: 'ACOS',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'ACOS(número)',
    descripcion: 'El arco coseno, en radianes (entre 0 y π). Fuera de -1 a 1, #¡NUM!.',
    ejemplo: 'ACOS(-1)',
    evaluar: deReal(Math.acos),
  },
  {
    nombre: 'ATAN',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'ATAN(número)',
    descripcion: 'El arco tangente, en radianes (entre -π/2 y π/2).',
    ejemplo: 'GRADOS(ATAN(1))',
    evaluar: deReal(Math.atan),
  },
  {
    nombre: 'ATAN2',
    minimo: 2,
    maximo: 2,
    categoria: 'Matemáticas',
    firma: 'ATAN2(x; y)',
    descripcion: 'El ángulo del punto (x; y), en radianes (entre -π y π). Primero va x, al revés que en otros lenguajes. En (0; 0), #¡DIV/0!.',
    ejemplo: 'GRADOS(ATAN2(-1; 1))',
    evaluar: ([a, b]) => {
      const x = argNumero(a)
      if (typeof x !== 'number') return x
      const y = argNumero(b)
      if (typeof y !== 'number') return y
      return x === 0 && y === 0 ? error('#¡DIV/0!') : numero(Math.atan2(y, x))
    },
  },
  {
    nombre: 'SENOH',
    alias: ['SINH'],
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'SENOH(número)',
    descripcion: 'El seno hiperbólico.',
    ejemplo: 'SENOH(1)',
    evaluar: deReal(Math.sinh),
  },
  {
    nombre: 'COSH',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'COSH(número)',
    descripcion: 'El coseno hiperbólico.',
    ejemplo: 'COSH(1)',
    evaluar: deReal(Math.cosh),
  },
  {
    nombre: 'TANH',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'TANH(número)',
    descripcion: 'La tangente hiperbólica.',
    ejemplo: 'TANH(1)',
    evaluar: deReal(Math.tanh),
  },
  {
    nombre: 'ASENOH',
    alias: ['ASINH'],
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'ASENOH(número)',
    descripcion: 'La inversa del seno hiperbólico.',
    ejemplo: 'ASENOH(1)',
    evaluar: deReal(Math.asinh),
  },
  {
    nombre: 'ACOSH',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'ACOSH(número)',
    descripcion: 'La inversa del coseno hiperbólico. Menor que 1, #¡NUM!.',
    ejemplo: 'ACOSH(10)',
    evaluar: deReal(Math.acosh),
  },
  {
    nombre: 'ATANH',
    minimo: 1,
    maximo: 1,
    categoria: 'Matemáticas',
    firma: 'ATANH(número)',
    descripcion: 'La inversa de la tangente hiperbólica. Fuera de -1 a 1 (sin incluirlos), #¡NUM!.',
    ejemplo: 'ATANH(0,5)',
    evaluar: deReal(Math.atanh),
  },
]

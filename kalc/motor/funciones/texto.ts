/**
 * Texto: CONCAT, IZQUIERDA, DERECHA, EXTRAE, LARGO, MAYUSC, MINUSC, ESPACIOS, TEXTO, VALOR, HALLAR,
 * ENCONTRAR y CONTIENE (propia de Kalc). Todas menos CONCAT son de un valor (`porCelda`): con una
 * columna, van celda por celda.
 */

import { argEntero, argTexto } from './comunes.ts'
import { comodines } from './criterios.ts'
import { aplicarFormato } from './formato.ts'
import type { Argumento, DefinicionFuncion } from './registro.ts'
import { aTexto, error, esError, LARGO_MAXIMO_TEXTO, logico, numero, texto, textoANumero, type Valor } from '../valores.ts'

/** Una función de un texto: `MAYUSC(t)`. Los números se pasan a texto como en el &. */
function conTexto(a: Argumento | undefined, f: (t: string) => Valor): Valor {
  const t = argTexto(a)
  return typeof t === 'string' ? f(t) : t
}

/** IZQUIERDA y DERECHA: cuántos caracteres (por defecto 1; negativo, #¡VALOR!). */
function extremo(args: readonly Argumento[], cortar: (t: string, n: number) => string): Valor {
  const [t, n] = args
  const s = argTexto(t)
  if (typeof s !== 'string') return s
  const cantidad = n ? argEntero(n) : 1
  if (typeof cantidad !== 'number') return cantidad
  return cantidad < 0 ? error('#¡VALOR!') : texto(cortar(s, cantidad))
}

/**
 * HALLAR y ENCONTRAR: la posición (desde 1) de lo buscado dentro del texto, buscando desde
 * `posición_inicial` (por defecto 1). Como en Excel: lo buscado vacío da la posición inicial; si no
 * está, o la posición inicial es menor que 1 o mayor que el largo del texto, #¡VALOR!.
 */
function posicion(args: readonly Argumento[], buscar: (buscado: string, dentro: string, desde: number) => number): Valor {
  const [b, d, i] = args
  const buscado = argTexto(b)
  if (typeof buscado !== 'string') return buscado
  const dentro = argTexto(d)
  if (typeof dentro !== 'string') return dentro
  const inicio = i ? argEntero(i) : 1
  if (typeof inicio !== 'number') return inicio
  if (inicio < 1 || inicio > dentro.length) return error('#¡VALOR!')
  if (buscado === '') return numero(inicio)
  const p = buscar(buscado, dentro, inicio - 1)
  return p < 0 ? error('#¡VALOR!') : numero(p + 1)
}

export const TEXTO: DefinicionFuncion[] = [
  {
    nombre: 'CONCAT',
    alias: ['CONCATENAR', 'CONCATENATE'],
    minimo: 1,
    maximo: 254,
    categoria: 'Texto',
    firma: 'CONCAT(texto1; [texto2]; …)',
    descripcion: 'Une los textos, igual que el operador &. Los números van como en el formato General: 1,5 → "1,5".',
    ejemplo: 'CONCAT("Total: "; 1234,5; " $")',
    evaluar: (args) => {
      let r = ''
      for (const a of args) {
        const t = argTexto(a)
        if (typeof t !== 'string') return t
        r += t
      }
      return r.length > LARGO_MAXIMO_TEXTO ? error('#¡VALOR!') : texto(r)
    },
  },
  {
    nombre: 'IZQUIERDA',
    alias: ['LEFT'],
    minimo: 1,
    maximo: 2,
    categoria: 'Texto',
    porCelda: true,
    firma: 'IZQUIERDA(texto; [cantidad])',
    descripcion: 'Los primeros caracteres del texto (por defecto, uno).',
    ejemplo: 'IZQUIERDA("20-12345678-9"; 2)',
    evaluar: (args) => extremo(args, (t, n) => t.slice(0, n)),
  },
  {
    nombre: 'DERECHA',
    alias: ['RIGHT'],
    minimo: 1,
    maximo: 2,
    categoria: 'Texto',
    porCelda: true,
    firma: 'DERECHA(texto; [cantidad])',
    descripcion: 'Los últimos caracteres del texto (por defecto, uno).',
    ejemplo: 'DERECHA("20-12345678-9"; 1)',
    evaluar: (args) => extremo(args, (t, n) => (n === 0 ? '' : t.slice(-n))),
  },
  {
    nombre: 'EXTRAE',
    alias: ['MID'],
    minimo: 3,
    maximo: 3,
    categoria: 'Texto',
    porCelda: true,
    firma: 'EXTRAE(texto; posición_inicial; cantidad)',
    descripcion: 'Una parte del texto: desde la posición (la primera es 1), esa cantidad de caracteres.',
    ejemplo: 'EXTRAE("20-12345678-9"; 4; 8)',
    evaluar: ([t, i, n]) => {
      const s = argTexto(t)
      if (typeof s !== 'string') return s
      const inicio = argEntero(i)
      if (typeof inicio !== 'number') return inicio
      const cantidad = argEntero(n)
      if (typeof cantidad !== 'number') return cantidad
      if (inicio < 1 || cantidad < 0) return error('#¡VALOR!')
      return texto(s.slice(inicio - 1, inicio - 1 + cantidad))
    },
  },
  {
    nombre: 'LARGO',
    alias: ['LEN'],
    minimo: 1,
    maximo: 1,
    categoria: 'Texto',
    porCelda: true,
    firma: 'LARGO(texto)',
    descripcion: 'La cantidad de caracteres, espacios incluidos.',
    ejemplo: 'LARGO("hola mundo")',
    evaluar: ([a]) => conTexto(a, (t) => numero(t.length)),
  },
  {
    nombre: 'MAYUSC',
    alias: ['UPPER'],
    minimo: 1,
    maximo: 1,
    categoria: 'Texto',
    porCelda: true,
    firma: 'MAYUSC(texto)',
    descripcion: 'El texto en mayúsculas.',
    ejemplo: 'MAYUSC("año fiscal")',
    evaluar: ([a]) => conTexto(a, (t) => texto(t.toLocaleUpperCase('es'))),
  },
  {
    nombre: 'MINUSC',
    alias: ['LOWER'],
    minimo: 1,
    maximo: 1,
    categoria: 'Texto',
    porCelda: true,
    firma: 'MINUSC(texto)',
    descripcion: 'El texto en minúsculas.',
    ejemplo: 'MINUSC("IVA Responsable")',
    evaluar: ([a]) => conTexto(a, (t) => texto(t.toLocaleLowerCase('es'))),
  },
  {
    nombre: 'ESPACIOS',
    alias: ['TRIM'],
    minimo: 1,
    maximo: 1,
    categoria: 'Texto',
    porCelda: true,
    firma: 'ESPACIOS(texto)',
    descripcion: 'Quita los espacios del principio y del final, y deja uno solo entre palabras.',
    ejemplo: 'ESPACIOS("  Juan    Pérez ")',
    // Solo el espacio común: Excel no toca tabulaciones ni el espacio duro.
    evaluar: ([a]) => conTexto(a, (t) => texto(t.replace(/ +/g, ' ').replace(/^ | $/g, ''))),
  },
  {
    nombre: 'TEXTO',
    alias: ['TEXT'],
    minimo: 2,
    maximo: 2,
    categoria: 'Texto',
    porCelda: true,
    firma: 'TEXTO(valor; formato)',
    descripcion: 'El número (o la fecha) como texto, con un formato de Excel: "#.##0,00", "0%", "dd/mm/aaaa", "mmmm".',
    ejemplo: 'TEXTO(1234,5; "$ #.##0,00")',
    evaluar: ([v, f]) => {
      const valor = v?.() ?? numero(0)
      if (esError(valor)) return valor
      const formato = argTexto(f)
      if (typeof formato !== 'string') return formato
      let n: number
      if (valor.tipo === 'numero' || valor.tipo === 'fecha') n = valor.valor
      else if (valor.tipo === 'vacio') n = 0
      else {
        // Un texto que no es número, o un lógico, Excel lo devuelve tal cual.
        const t = aTexto(valor) as string
        const x = valor.tipo === 'texto' ? textoANumero(t) : null
        if (x === null) return texto(t)
        n = x
      }
      const r = aplicarFormato(n, formato)
      return r === null ? error('#¡VALOR!') : texto(r)
    },
  },
  {
    nombre: 'HALLAR',
    alias: ['SEARCH'],
    minimo: 2,
    maximo: 3,
    categoria: 'Texto',
    porCelda: true,
    firma: 'HALLAR(texto_buscado; dentro_del_texto; [posición_inicial])',
    descripcion:
      'La posición del texto buscado dentro de otro, sin distinguir mayúsculas y con comodines (* y ?). Si no está, #¡VALOR!: ' +
      'ESNUMERO(HALLAR(…)) dice si lo contiene.',
    ejemplo: 'HALLAR("pérez"; "Juan Pérez")',
    evaluar: (args) =>
      posicion(args, (buscado, dentro, desde) => {
        const m = comodines(buscado, false).exec(dentro.slice(desde))
        return m ? m.index + desde : -1
      }),
  },
  {
    nombre: 'ENCONTRAR',
    alias: ['FIND'],
    minimo: 2,
    maximo: 3,
    categoria: 'Texto',
    porCelda: true,
    firma: 'ENCONTRAR(texto_buscado; dentro_del_texto; [posición_inicial])',
    descripcion: 'Como HALLAR, pero distingue mayúsculas y sin comodines: el texto buscado, tal cual.',
    ejemplo: 'ENCONTRAR("P"; "Juan Pérez")',
    evaluar: (args) => posicion(args, (buscado, dentro, desde) => dentro.indexOf(buscado, desde)),
  },
  {
    // Propia de Kalc: Excel no la tiene. Es ESNUMERO(HALLAR(texto_buscado; texto)), más fácil de leer.
    nombre: 'CONTIENE',
    minimo: 2,
    maximo: 2,
    categoria: 'Texto',
    porCelda: true,
    propia: true,
    firma: 'CONTIENE(texto; texto_buscado)',
    descripcion:
      'VERDADERO si el texto contiene el texto buscado, sin distinguir mayúsculas y con comodines (* y ?), como HALLAR. ' +
      'No es de Excel: allá se escribe ESNUMERO(HALLAR(texto_buscado; texto)).',
    ejemplo: 'CONTIENE("Juan Pérez"; "pérez")',
    evaluar: ([t, b]) => {
      // Los errores de los argumentos se propagan; que no esté, es FALSO.
      const dentro = argTexto(t)
      if (typeof dentro !== 'string') return dentro
      const buscado = argTexto(b)
      if (typeof buscado !== 'string') return buscado
      return logico(buscado === '' || comodines(buscado, false).test(dentro))
    },
  },
  {
    nombre: 'VALOR',
    alias: ['VALUE'],
    minimo: 1,
    maximo: 1,
    categoria: 'Texto',
    porCelda: true,
    firma: 'VALOR(texto)',
    descripcion: 'Convierte en número un texto escrito como número o como fecha: "1.234,5", "50%", "31/12/2026".',
    ejemplo: 'VALOR("1.234,5") * 2',
    evaluar: ([a]) => {
      const v = a?.() ?? numero(0)
      switch (v.tipo) {
        case 'numero':
        case 'fecha':
          return numero(v.valor)
        case 'vacio':
          return numero(0)
        case 'error':
          return v
        case 'logico':
          return error('#¡VALOR!')
        case 'texto': {
          const x = textoANumero(v.valor)
          return x === null ? error('#¡VALOR!') : numero(x)
        }
      }
    },
  },
]

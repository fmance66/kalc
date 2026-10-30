/**
 * Variables con nombre: cada una es una constante, una fórmula que usa otras, una consulta a la base
 * (con otras como parámetros) o, si es de tipo tabla, datos escritos a mano; una tabla puede sumar
 * columnas calculadas fila por fila. El catálogo arma el grafo de dependencias, calcula en orden
 * topológico, marca los ciclos y, al cambiar una variable, recalcula solo las que dependen de ella.
 */

import { dependencias, hijos, type Nodo } from './ast.ts'
import { ErrorConsulta, parametrosConsulta, sirveComoParametro, type EjecutorConsultas } from './consultas.ts'
import { evaluarArbol, evaluarComoTabla, type Contexto } from './evaluador.ts'
import type { Posicion } from './lexer.ts'
import { parsear } from './parser.ts'
import { indiceDeColumna, rangoDeTabla, valorDeRango, type Tabla } from './tablas.ts'
import { error, esTextoFecha, fecha, formatear, logico, numero, redondear15, texto, textoANumero, VACIO, type Valor } from './valores.ts'

/**
 * El tipo esperado del resultado. `entero` es un número sin decimales (Excel no los distingue).
 * `tabla`: filas y columnas (de una consulta, una fórmula como FILTRAR o datos escritos a mano),
 * que las fórmulas usan como `Ventas[Importe]`.
 */
export type TipoVariable = 'numero' | 'entero' | 'texto' | 'logico' | 'fecha' | 'tabla'

const TIPOS: readonly string[] = ['numero', 'entero', 'texto', 'logico', 'fecha', 'tabla'] satisfies TipoVariable[]

export interface Variable {
  nombre: string
  tipo: TipoVariable
  origen:
    | { clase: 'constante'; valor: Valor }
    /** De tipo tabla, puede dar una tabla: `FILTRAR(Ventas; Ventas[Estado] = 2)`. */
    | { clase: 'formula'; texto: string }
    /**
     * Un SELECT que devuelve un solo valor (o filas, si es de tipo tabla); `:Nombre` es otra variable,
     * como parámetro. `conexion`: en qué base corre, si la aplicación tiene varias (sin ella, la de
     * por defecto).
     */
    | { clase: 'consulta'; sql: string; conexion?: string }
    /** Una tabla escrita a mano (alícuotas, topes): ver `leerDatos` y `escribirDatos`. */
    | { clase: 'datos'; tabla: Tabla }
  /** De tipo tabla: columnas que se le agregan, calculadas fila por fila. */
  columnas?: ColumnaCalculada[]
  descripcion?: string
}

/**
 * Una columna calculada: la fórmula se calcula para cada fila de la tabla, y `[@Alta]` es la celda
 * de esa fila en la columna Alta (también las calculadas antes). Puede usar otras variables y la
 * misma tabla entera (`[@Monto] / SUMA(Causas[Monto])`), sin que sea un ciclo.
 */
export interface ColumnaCalculada {
  nombre: string
  formula: string
}

/** Por qué una variable no tiene el valor que se espera. */
export type Problema =
  | ({ clase: 'sintaxis'; mensaje: string } & Posicion)
  /** El camino del ciclo, empezando y terminando en la variable: `['A', 'B', 'A']`. */
  | { clase: 'ciclo'; camino: string[] }
  /** Nombra variables que no existen (dan #¿NOMBRE?). */
  | { clase: 'faltan'; nombres: string[] }
  /** El resultado no es del tipo declarado: se avisa, no se convierte. */
  | { clase: 'tipo'; mensaje: string }
  /** Una consulta que todavía no se corrió con estos parámetros (vale #N/D): ver `resolverConsultas`. */
  | { clase: 'pendiente' }
  /** La consulta falló: el motivo que dio el ejecutor (varias filas, error de la base…). */
  | { clase: 'consulta'; mensaje: string }
  /** Una columna calculada no se puede calcular: error de sintaxis, nombre repetido. */
  | { clase: 'columna'; columna: string; mensaje: string }

export interface EstadoVariable {
  /** De una tabla: su valor como si fuera una celda (#¡VALOR! si tiene más de una). */
  valor: Valor
  /** Las filas de una variable de tipo tabla, ya resuelta. */
  tabla?: Tabla
  /** Las variables que nombra la fórmula (o los parámetros de la consulta), como están escritas. */
  dependencias: string[]
  problema?: Problema
}

export interface Catalogo {
  /** Las variables, en el orden en que se agregaron. */
  variables(): Variable[]
  buscar(nombre: string): Variable | undefined
  estado(nombre: string): EstadoVariable | undefined
  /** Para evaluar otras fórmulas con los valores del catálogo. */
  contexto(): Contexto
  /**
   * Agrega o reemplaza una variable (por nombre, sin distinguir mayúsculas) y recalcula ella y las
   * que dependen de ella. Devuelve las recalculadas, en orden de cálculo.
   */
  definir(variable: Variable): string[]
  /** Las que dependían de ella pasan a dar #¿NOMBRE?. */
  quitar(nombre: string): string[]
  /**
   * Le cambia el nombre y corrige las fórmulas que la usan, como Excel con los nombres definidos.
   * Lanza un error si el nombre nuevo no es válido o ya existe.
   */
  renombrar(anterior: string, nuevo: string): string[]
  /** Recalcula una variable y sus dependientes, o todas (por las funciones volátiles como HOY). */
  recalcular(nombre?: string): string[]
  /**
   * Corre las consultas pendientes con el ejecutor y recalcula lo que depende de ellas, por tandas
   * (una consulta que usa otra como parámetro espera a la primera). Con `refrescar` corre también
   * las que ya tenían resultado (los datos de la base cambian): todas, o las de la lista.
   * Devuelve las recalculadas.
   */
  resolverConsultas(ejecutor: EjecutorConsultas, opciones?: { refrescar?: boolean | readonly string[] }): Promise<string[]>
}

// --- Nombres ------------------------------------------------------------------------------------

/** Un nombre que se puede escribir sin corchetes en una fórmula. */
const NOMBRE_SIMPLE = /^[\p{L}_][\p{L}\p{N}_.]*$/u
const LOGICOS = new Set(['VERDADERO', 'FALSO', 'TRUE', 'FALSE'])
/** A1, BC12, XFD1048576: Excel no deja definir nombres así, para que no se confundan con celdas. */
const PARECE_CELDA = /^[a-z]{1,3}\d+$/i

/** El motivo por el que el nombre no sirve, o `null` si sirve. */
export function validarNombre(nombre: string): string | null {
  const n = nombre.trim()
  if (!n) return 'Falta el nombre'
  if (n !== nombre) return 'El nombre no puede empezar ni terminar con espacios'
  if (n.includes(']')) return 'El nombre no puede tener ]'
  if (PARECE_CELDA.test(n)) return 'Parece una referencia de celda (como A1)'
  if (LOGICOS.has(n.toUpperCase())) return `${n} es un valor lógico`
  return null
}

/** Cómo se escribe la variable en una fórmula: `Alicuota`, o `[Base imponible]` si hace falta. */
export function nombreEnFormula(nombre: string): string {
  return NOMBRE_SIMPLE.test(nombre) && !LOGICOS.has(nombre.toUpperCase()) ? nombre : `[${nombre}]`
}

// --- Constantes ---------------------------------------------------------------------------------

/**
 * El valor de una constante escrita como texto, según su tipo: `1.234,5`, `31/12/2026`,
 * `VERDADERO`. Vacío es una variable sin valor (como una celda vacía).
 */
export function leerConstante(escrito: string, tipo: TipoVariable): { ok: true; valor: Valor } | { ok: false; mensaje: string } {
  if (tipo === 'texto') return { ok: true, valor: escrito === '' ? VACIO : texto(escrito) }
  if (tipo === 'tabla') return { ok: false, mensaje: 'Una tabla sale de una consulta a la base' }
  const t = escrito.trim()
  if (!t) return { ok: true, valor: VACIO }
  switch (tipo) {
    case 'numero':
    case 'entero': {
      const n = esTextoFecha(t) ? null : textoANumero(t)
      if (n === null) return { ok: false, mensaje: 'No es un número (por ejemplo: 1234,5)' }
      if (tipo === 'entero' && !Number.isInteger(redondear15(n))) return { ok: false, mensaje: 'No es un número entero' }
      return { ok: true, valor: numero(n) }
    }
    case 'logico': {
      const u = t.toUpperCase()
      if (u === 'VERDADERO' || u === 'TRUE') return { ok: true, valor: logico(true) }
      if (u === 'FALSO' || u === 'FALSE') return { ok: true, valor: logico(false) }
      return { ok: false, mensaje: 'Escribí VERDADERO o FALSO' }
    }
    case 'fecha': {
      const n = esTextoFecha(t) ? textoANumero(t) : null
      return n === null ? { ok: false, mensaje: 'No es una fecha (dd/mm/aaaa)' } : { ok: true, valor: fecha(n) }
    }
  }
}

const NOMBRE_TIPO: Record<Valor['tipo'] | TipoVariable, string> = {
  numero: 'un número',
  entero: 'un número entero',
  texto: 'un texto',
  logico: 'un lógico',
  fecha: 'una fecha',
  error: 'un error',
  vacio: 'vacío',
  tabla: 'una tabla',
}

/** Si el valor no es del tipo declarado, el motivo. Un error o un vacío no es un problema de tipo. */
export function problemaDeTipo(valor: Valor, tipo: TipoVariable): string | null {
  if (valor.tipo === 'error' || valor.tipo === 'vacio') return null
  if (tipo === 'entero') {
    if (valor.tipo !== 'numero') return `Da ${NOMBRE_TIPO[valor.tipo]} y se declaró número entero`
    return Number.isInteger(redondear15(valor.valor)) ? null : `Da ${formatear(valor)} y se declaró número entero`
  }
  return valor.tipo === tipo ? null : `Da ${NOMBRE_TIPO[valor.tipo]} y se declaró ${NOMBRE_TIPO[tipo].replace(/^un[a]? /, '')}`
}

/** Para leer variables de un JSON (importado o guardado): si tiene la forma de una `Variable`. */
export function esVariable(x: unknown): x is Variable {
  if (typeof x !== 'object' || x === null) return false
  const v = x as Record<string, unknown>
  const origen = v['origen'] as Record<string, unknown> | null | undefined
  if (typeof v['nombre'] !== 'string' || !TIPOS.includes(v['tipo'] as string)) return false
  if (v['descripcion'] !== undefined && typeof v['descripcion'] !== 'string') return false
  if (typeof origen !== 'object' || origen === null) return false
  const columnas = v['columnas']
  if (columnas !== undefined && !(Array.isArray(columnas) && columnas.every(esColumnaCalculada))) return false
  if (origen['clase'] === 'formula') return typeof origen['texto'] === 'string'
  if (origen['clase'] === 'consulta') return typeof origen['sql'] === 'string' && (origen['conexion'] === undefined || typeof origen['conexion'] === 'string')
  if (origen['clase'] === 'datos') return esTabla(origen['tabla'])
  return origen['clase'] === 'constante' && esValor(origen['valor'])
}

function esColumnaCalculada(x: unknown): x is ColumnaCalculada {
  if (typeof x !== 'object' || x === null) return false
  const c = x as Record<string, unknown>
  return typeof c['nombre'] === 'string' && typeof c['formula'] === 'string'
}

/** Para leer una tabla de un JSON (la respuesta del servidor): columnas de texto y filas de valores. */
export function esTabla(x: unknown): x is Tabla {
  if (typeof x !== 'object' || x === null) return false
  const { columnas, filas } = x as Record<string, unknown>
  return (
    Array.isArray(columnas) &&
    columnas.every((c) => typeof c === 'string') &&
    Array.isArray(filas) &&
    filas.every((f) => Array.isArray(f) && f.length === columnas.length && f.every(esValor))
  )
}

function esValor(x: unknown): x is Valor {
  if (typeof x !== 'object' || x === null) return false
  const v = x as Record<string, unknown>
  switch (v['tipo']) {
    case 'numero':
    case 'fecha':
      return typeof v['valor'] === 'number' && Number.isFinite(v['valor'])
    case 'texto':
      return typeof v['valor'] === 'string'
    case 'logico':
      return typeof v['valor'] === 'boolean'
    case 'error':
      return typeof v['valor'] === 'string' && v['valor'].startsWith('#')
    case 'vacio':
      return true
    default:
      return false
  }
}

// --- Catálogo -----------------------------------------------------------------------------------

interface Entrada {
  variable: Variable
  /** El árbol de la fórmula (se parsea una vez, al definirla). */
  arbol?: Nodo
  /** De una consulta: los parámetros, como están escritos en el SQL. */
  parametros: string[]
  /** Las columnas calculadas, parseadas (o con el error de sintaxis). */
  columnas: { nombre: string; arbol?: Nodo; error?: string }[]
  /** Las dependencias en minúsculas, para el grafo. */
  usa: Set<string>
  estado: EstadoVariable
  /** De una consulta: el último resultado y con qué parámetros se obtuvo. */
  resultado?: Resultado
  /** De una consulta: si el estado muestra el resultado (y no un error de los parámetros). */
  muestraResultado?: boolean
}

interface Resultado {
  /** Los valores de los parámetros, en JSON: si cambian, hay que volver a correrla. */
  firma: string
  /** De una tabla: su valor como celda (`valorDeRango`). */
  valor: Valor
  tabla?: Tabla
  mensaje?: string
}

const clave = (nombre: string) => nombre.toLowerCase()

export function crearCatalogo(variables: readonly Variable[] = []): Catalogo {
  return new CatalogoGrafo(variables)
}

class CatalogoGrafo implements Catalogo {
  /** Por nombre en minúsculas; el Map conserva el orden en que se agregaron. */
  private readonly entradas = new Map<string, Entrada>()
  /** Grafo inverso: por cada nombre (exista o no), las variables que lo usan. */
  private readonly usadaPor = new Map<string, Set<string>>()

  constructor(variables: readonly Variable[]) {
    // Si un nombre se repite, queda la última.
    for (const v of variables) this.cargar(v)
    this.recalcular()
  }

  variables(): Variable[] {
    return [...this.entradas.values()].map((e) => e.variable)
  }

  buscar(nombre: string): Variable | undefined {
    return this.entradas.get(clave(nombre))?.variable
  }

  estado(nombre: string): EstadoVariable | undefined {
    return this.entradas.get(clave(nombre))?.estado
  }

  contexto(): Contexto {
    return {
      variables: (nombre) => this.entradas.get(clave(nombre))?.estado.valor,
      tablas: (nombre) => this.entradas.get(clave(nombre))?.estado.tabla,
    }
  }

  definir(variable: Variable): string[] {
    const motivo = validarNombre(variable.nombre)
    if (motivo) throw new Error(`Nombre de variable inválido «${variable.nombre}»: ${motivo}`)
    this.cargar(variable)
    return this.recalcularDesde([variable.nombre])
  }

  quitar(nombre: string): string[] {
    const e = this.entradas.get(clave(nombre))
    if (!e) return []
    this.desconectar(clave(nombre), e)
    this.entradas.delete(clave(nombre))
    return this.recalcularDesde([nombre])
  }

  renombrar(anterior: string, nuevo: string): string[] {
    const e = this.entradas.get(clave(anterior))
    if (!e) throw new Error(`No existe la variable «${anterior}»`)
    const motivo = validarNombre(nuevo)
    if (motivo) throw new Error(`Nombre de variable inválido «${nuevo}»: ${motivo}`)
    const mismo = clave(anterior) === clave(nuevo)
    if (!mismo && this.entradas.has(clave(nuevo))) throw new Error(`Ya existe una variable «${nuevo}»`)

    // Las fórmulas y consultas que la nombran (también la propia, si se usa a sí misma) se reescriben.
    const usuarias = this.usadaPor.get(clave(anterior)) ?? new Set<string>()
    const consulta = [...usuarias].map((k) => this.entradas.get(k)?.variable).find((v) => v?.origen.clase === 'consulta')
    if (consulta && !sirveComoParametro(nuevo)) {
      throw new Error(`«${nuevo}» no sirve como parámetro de la consulta de «${consulta.nombre}» (solo letras, números y _)`)
    }
    const nuevas = [...this.entradas].map(([k, x]) => {
      let v = x === e ? { ...x.variable, nombre: nuevo } : x.variable
      if (usuarias.has(k) && v.origen.clase === 'formula' && x.arbol) {
        v = { ...v, origen: { clase: 'formula', texto: reemplazarReferencias(v.origen.texto, x.arbol, anterior, nuevo) } }
      }
      // Las columnas calculadas que la nombran; también las de la propia tabla (`Ventas[@Monto]`).
      if ((usuarias.has(k) || x === e) && v.columnas) {
        v = {
          ...v,
          columnas: v.columnas.map((c) => {
            const r = parsear(c.formula)
            return r.ok ? { ...c, formula: reemplazarReferencias(c.formula, r.arbol, anterior, nuevo) } : c
          }),
        }
      }
      if (usuarias.has(k) && v.origen.clase === 'consulta') {
        v = { ...v, origen: { ...v.origen, sql: reemplazarParametros(v.origen.sql, anterior, nuevo) } }
      }
      return { variable: v, estado: x.estado, resultado: x.resultado }
    })
    // Se reconstruye todo para que la variable conserve su lugar en la lista; las que no se tocan
    // conservan su valor y solo se recalcula lo afectado.
    this.entradas.clear()
    this.usadaPor.clear()
    for (const { variable, estado, resultado } of nuevas) {
      this.cargar(variable)
      const cargada = this.entradas.get(clave(variable.nombre)) as Entrada
      if (cargada.arbol || variable.origen.clase !== 'formula') cargada.estado = { ...estado, dependencias: cargada.estado.dependencias }
      // Los parámetros valen lo mismo: el resultado de la consulta sigue sirviendo.
      if (resultado) cargada.resultado = resultado
    }
    return this.recalcularDesde([anterior, nuevo])
  }

  recalcular(nombre?: string): string[] {
    return this.recalcularDesde(nombre === undefined ? [...this.entradas.values()].map((e) => e.variable.nombre) : [nombre])
  }

  async resolverConsultas(ejecutor: EjecutorConsultas, { refrescar = false }: { refrescar?: boolean | readonly string[] } = {}): Promise<string[]> {
    const aRefrescar = (e: Entrada) => refrescar === true || (refrescar !== false && refrescar.some((n) => clave(n) === clave(e.variable.nombre)))
    const recalculadas = new Set<string>()
    const consultas = () => [...this.entradas.values()].filter((e) => e.variable.origen.clase === 'consulta')
    // Cada tanda resuelve al menos un nivel; el tope es por si el catálogo cambia mientras se espera.
    for (let tanda = 0, tope = consultas().length + 2; tanda < tope; tanda++) {
      const listas = consultas().filter((e) => this.listaParaCorrer(e, tanda === 0 && aRefrescar(e)))
      if (listas.length === 0) break
      const resueltas = await Promise.all(listas.map((e) => this.correr(e, ejecutor)))
      for (const nombre of this.recalcularDesde(resueltas.filter((n) => n !== null))) recalculadas.add(nombre)
    }
    return [...recalculadas]
  }

  /** Corre la consulta y guarda el resultado; devuelve el nombre, o `null` si ya no corresponde. */
  private async correr(e: Entrada, ejecutor: EjecutorConsultas): Promise<string | null> {
    const parametros = this.parametros(e)
    const firma = JSON.stringify(Object.values(parametros))
    const { sql, conexion } = e.variable.origen.clase === 'consulta' ? e.variable.origen : { sql: '', conexion: undefined }
    const tabla = e.variable.tipo === 'tabla'
    let resultado: Resultado
    try {
      const r = await ejecutor({ nombre: e.variable.nombre, sql, parametros, ...(tabla ? { tabla } : {}), ...(conexion ? { conexion } : {}) })
      resultado = 'columnas' in r ? { firma, valor: valorDeRango(r.filas), tabla: r } : { firma, valor: r }
      // Varias filas para una variable de un valor: el error lo explica.
      if (!tabla && resultado.tabla && resultado.valor.tipo === 'error') {
        resultado.mensaje = `La consulta devolvió ${resultado.tabla.filas.length} filas y ${resultado.tabla.columnas.length} columnas; para usarlas todas, declarala de tipo tabla`
      }
    } catch (x) {
      resultado = { firma, valor: error(x instanceof ErrorConsulta ? x.codigo : '#¡VALOR!'), mensaje: x instanceof Error ? x.message : String(x) }
    }
    // Si mientras tanto la redefinieron o la quitaron, el resultado ya no es de ella.
    if (this.entradas.get(clave(e.variable.nombre)) !== e) return null
    e.resultado = resultado
    return e.variable.nombre
  }

  /** Parsea la variable y la agrega al grafo, sin calcular. */
  private cargar(variable: Variable) {
    const k = clave(variable.nombre)
    const anterior = this.entradas.get(k)
    if (anterior) this.desconectar(k, anterior)
    const entrada: Entrada = { variable, parametros: [], columnas: [], usa: new Set(), estado: { valor: VACIO, dependencias: [] } }
    /** Las dependencias, sin repetir, como están escritas. */
    const usadas = new Map<string, string>()
    const usar = (nombres: readonly string[]) => {
      for (const n of nombres) if (!usadas.has(clave(n))) usadas.set(clave(n), n)
    }
    if (variable.origen.clase === 'formula') {
      const r = parsear(variable.origen.texto)
      if (r.ok) {
        entrada.arbol = r.arbol
        usar(dependencias(r.arbol))
      } else {
        // Excel no deja ni escribirla; acá queda con el error marcado y da #¡VALOR!.
        entrada.estado = { valor: error('#¡VALOR!'), dependencias: [], problema: { clase: 'sintaxis', ...r.error } }
      }
    } else if (variable.origen.clase === 'consulta') {
      const vistos = new Map<string, string>()
      for (const p of parametrosConsulta(variable.origen.sql)) if (!vistos.has(clave(p.nombre))) vistos.set(clave(p.nombre), p.nombre)
      entrada.parametros = [...vistos.values()]
      usar(entrada.parametros)
      // Si solo cambió la descripción o el tipo, no hace falta volver a correrla (salvo que pase a
      // ser una tabla, o deje de serlo: se piden otras cosas). Otra conexión es otra base: sí.
      const o = anterior?.variable.origen
      const mismaForma = (anterior?.variable.tipo === 'tabla') === (variable.tipo === 'tabla')
      if (anterior?.resultado && o?.clase === 'consulta' && o.sql === variable.origen.sql && o.conexion === variable.origen.conexion && mismaForma) entrada.resultado = anterior.resultado
    }
    // Las columnas calculadas: lo que nombran también es una dependencia, salvo la misma tabla.
    for (const c of variable.tipo === 'tabla' ? (variable.columnas ?? []) : []) {
      const r = parsear(c.formula)
      if (!r.ok) {
        entrada.columnas.push({ nombre: c.nombre, error: r.error.mensaje })
        continue
      }
      entrada.columnas.push({ nombre: c.nombre, arbol: r.arbol })
      usar(dependencias(r.arbol).filter((d) => clave(d) !== k))
    }
    entrada.estado.dependencias = [...usadas.values()]
    entrada.usa = new Set(usadas.keys())
    for (const d of entrada.usa) {
      let s = this.usadaPor.get(d)
      if (!s) this.usadaPor.set(d, (s = new Set()))
      s.add(k)
    }
    this.entradas.set(k, entrada)
  }

  private desconectar(k: string, e: Entrada) {
    for (const d of e.usa) this.usadaPor.get(d)?.delete(k)
  }

  /**
   * Recalcula las semillas y todo lo que depende de ellas, transitivamente. Tarjan sobre ese
   * subgrafo da las componentes fuertemente conexas ya en orden de cálculo (primero las
   * dependencias); una componente de más de una variable, o una que se usa a sí misma, es un ciclo.
   */
  private recalcularDesde(semillas: readonly string[]): string[] {
    const afectadas = new Set<string>()
    const pendientes = semillas.map(clave)
    for (let k = pendientes.pop(); k !== undefined; k = pendientes.pop()) {
      if (afectadas.has(k)) continue
      if (this.entradas.has(k)) afectadas.add(k)
      // Una variable que se acaba de quitar no está, pero las que la usaban sí hay que recalcularlas.
      for (const u of this.usadaPor.get(k) ?? []) if (!afectadas.has(u)) pendientes.push(u)
    }

    const orden: string[] = []
    for (const componente of componentesFuertes(afectadas, (k) => this.entradas.get(k)?.usa ?? new Set())) {
      const unica = componente[0]
      if (componente.length === 1 && unica !== undefined && !this.entradas.get(unica)?.usa.has(unica)) {
        this.calcular(unica)
      } else {
        const enCiclo = new Set(componente)
        for (const k of componente) {
          const e = this.entradas.get(k) as Entrada
          e.estado = { valor: error('#¡CICLO!'), dependencias: e.estado.dependencias, problema: { clase: 'ciclo', camino: this.camino(k, enCiclo) } }
        }
      }
      orden.push(...componente)
    }
    return orden.map((k) => this.entradas.get(k)?.variable.nombre ?? k)
  }

  private calcular(k: string) {
    const e = this.entradas.get(k) as Entrada
    const { variable } = e
    if (variable.origen.clase === 'formula' && !e.arbol) return // error de sintaxis: queda como se cargó
    if (variable.origen.clase === 'consulta') this.calcularConsulta(e)
    else this.calcularValor(e)
    if (e.estado.tabla && e.columnas.length > 0) this.agregarColumnas(e)
  }

  /** Una constante, una fórmula (que puede dar una tabla) o datos escritos a mano. */
  private calcularValor(e: Entrada) {
    const { variable } = e
    const { origen } = variable
    let valor: Valor
    let tabla: Tabla | undefined
    if (origen.clase === 'constante') valor = origen.valor
    else if (origen.clase === 'datos') {
      tabla = origen.tabla
      valor = valorDeRango(rangoDeTabla(tabla))
    } else {
      const r = evaluarComoTabla(e.arbol as Nodo, this.contexto())
      if ('columnas' in r) {
        tabla = r
        valor = valorDeRango(r.filas)
      } else valor = r
    }
    const estado: EstadoVariable = { valor, dependencias: e.estado.dependencias }
    let tipo: string | null
    if (variable.tipo === 'tabla') {
      if (tabla) estado.tabla = tabla
      tipo = tabla
        ? null
        : origen.clase === 'constante'
          ? 'Una tabla sale de una consulta, de una fórmula o de datos escritos a mano: elegí otra clase'
          : problemaDeTipo(valor, 'tabla')
    } else {
      // Una tabla de varias celdas en una variable de un valor: el error lo explica.
      tipo = tabla && valor.tipo === 'error' ? `Da una tabla de ${tabla.filas.length} filas y ${tabla.columnas.length} columnas: declarala de tipo tabla` : problemaDeTipo(valor, variable.tipo)
    }
    const faltan = e.estado.dependencias.filter((d) => !this.entradas.has(clave(d)))
    if (faltan.length > 0) estado.problema = { clase: 'faltan', nombres: faltan }
    else if (this.esperaConsulta(e)) estado.problema = { clase: 'pendiente' }
    else if (tipo) estado.problema = { clase: 'tipo', mensaje: tipo }
    e.estado = estado
  }

  /**
   * Agrega las columnas calculadas a la tabla del estado, una por una: cada fórmula se calcula para
   * cada fila, con `[@Columna]` leyendo la celda de esa fila. La misma tabla, nombrada entera, es la
   * que hay hasta esa columna.
   */
  private agregarColumnas(e: Entrada) {
    const base = e.estado.tabla as Tabla
    const columnas = [...base.columnas]
    const filas = base.filas.map((f) => [...f])
    const contexto = this.contexto()
    const tablas = contexto.tablas as (nombre: string) => Tabla | undefined
    let problema: Problema | undefined
    for (const c of e.columnas) {
      if (indiceDeColumna(columnas, c.nombre) >= 0 || !c.nombre.trim()) {
        problema ??= { clase: 'columna', columna: c.nombre, mensaje: c.nombre.trim() ? `Ya hay una columna ${c.nombre}` : 'Falta el nombre de la columna' }
        continue
      }
      if (c.error !== undefined) problema ??= { clase: 'columna', columna: c.nombre, mensaje: c.error }
      const hastaAca: Tabla = { columnas: [...columnas], filas: filas.map((f) => [...f]) }
      for (const fila of filas) {
        const deFila: Contexto = {
          ...contexto,
          tablas: (n) => (clave(n) === clave(e.variable.nombre) ? hastaAca : tablas(n)),
          fila: (columna) => {
            const i = indiceDeColumna(columnas, columna)
            return i < 0 ? undefined : fila[i]
          },
        }
        fila.push(c.arbol ? evaluarArbol(c.arbol, deFila) : error('#¡VALOR!'))
      }
      columnas.push(c.nombre)
    }
    const tabla: Tabla = { columnas, filas }
    e.estado = { ...e.estado, tabla, valor: valorDeRango(filas) }
    const faltan = e.estado.dependencias.filter((d) => !this.entradas.has(clave(d)))
    if (!e.estado.problema && faltan.length > 0) e.estado.problema = { clase: 'faltan', nombres: faltan }
    if (!e.estado.problema && problema) e.estado.problema = problema
  }

  /**
   * Si usa una consulta pendiente (directamente o a través de otras fórmulas): el valor no es el
   * final. De una consulta cuentan solo los parámetros: lo que usan sus columnas calculadas no
   * impide correrla.
   */
  private esperaConsulta(e: Entrada): boolean {
    const usa = e.variable.origen.clase === 'consulta' ? e.parametros.map(clave) : [...e.usa]
    return usa.some((d) => this.entradas.get(d)?.estado.problema?.clase === 'pendiente')
  }

  /**
   * Una consulta vale el último resultado si se obtuvo con los mismos parámetros; si no, queda
   * pendiente (#N/D) hasta `resolverConsultas`. Un parámetro con error no se manda a la base: la
   * consulta da ese error, como una fórmula.
   */
  private calcularConsulta(e: Entrada) {
    const { dependencias } = e.estado
    e.muestraResultado = false
    const faltan = e.parametros.filter((d) => !this.entradas.has(clave(d)))
    const estados = e.parametros.map((d) => this.entradas.get(clave(d))?.estado)
    const conError = estados.find((x) => x?.valor.tipo === 'error' && x.problema?.clase !== 'pendiente')
    let estado: EstadoVariable
    if (faltan.length > 0) estado = { valor: error('#¿NOMBRE?'), dependencias, problema: { clase: 'faltan', nombres: faltan } }
    else if (conError) estado = { valor: conError.valor, dependencias }
    else if (this.esperaConsulta(e) || e.resultado?.firma !== JSON.stringify(Object.values(this.parametros(e)))) {
      estado = { valor: error('#N/D'), dependencias, problema: { clase: 'pendiente' } }
    } else {
      e.muestraResultado = true
      const { valor, tabla, mensaje } = e.resultado
      estado = { valor, dependencias }
      const deTabla = e.variable.tipo === 'tabla'
      if (deTabla && tabla) estado.tabla = tabla
      // La de tipo tabla con sus filas no se compara con un tipo de valor; las otras, por su celda.
      const tipo = deTabla && tabla ? null : problemaDeTipo(valor, e.variable.tipo)
      if (mensaje !== undefined) estado.problema = { clase: 'consulta', mensaje }
      else if (tipo) estado.problema = { clase: 'tipo', mensaje: tipo }
    }
    e.estado = estado
  }

  /** Los valores de los parámetros de la consulta, por nombre como está escrito en el SQL. */
  private parametros(e: Entrada): Record<string, Valor> {
    const r: Record<string, Valor> = {}
    for (const d of e.parametros) r[d] = this.entradas.get(clave(d))?.estado.valor ?? VACIO
    return r
  }

  /** Pendiente con los parámetros ya resueltos, o (al refrescar) cualquiera que muestre su resultado. */
  private listaParaCorrer(e: Entrada, refrescar: boolean): boolean {
    if (e.estado.problema?.clase === 'pendiente') {
      return e.parametros.every((d) => this.entradas.get(clave(d))?.estado.problema?.clase !== 'pendiente')
    }
    return refrescar && e.resultado !== undefined && e.muestraResultado === true
  }

  /** Un camino de la variable a sí misma dentro del ciclo (el más corto), con los nombres como están escritos. */
  private camino(desde: string, enCiclo: ReadonlySet<string>): string[] {
    const previo = new Map<string, string>()
    const cola = [desde]
    while (cola.length > 0) {
      const k = cola.shift() as string
      for (const d of this.entradas.get(k)?.usa ?? []) {
        if (!enCiclo.has(d)) continue
        if (d === desde) {
          const camino = [desde]
          for (let x: string | undefined = k; x !== undefined && x !== desde; x = previo.get(x)) camino.unshift(x)
          camino.unshift(desde)
          return camino.map((c) => this.entradas.get(c)?.variable.nombre ?? c)
        }
        if (!previo.has(d)) {
          previo.set(d, k)
          cola.push(d)
        }
      }
    }
    return [desde]
  }
}

/**
 * Tarjan: las componentes fuertemente conexas de los `nodos` (las aristas a nodos de afuera se
 * ignoran: ya están calculados). Salen primero las componentes de las que dependen las demás.
 */
function componentesFuertes(nodos: ReadonlySet<string>, aristas: (n: string) => ReadonlySet<string>): string[][] {
  const indice = new Map<string, number>()
  const bajo = new Map<string, number>()
  const pila: string[] = []
  const enPila = new Set<string>()
  const resultado: string[][] = []
  let siguiente = 0

  const visitar = (n: string) => {
    indice.set(n, siguiente)
    bajo.set(n, siguiente)
    siguiente++
    pila.push(n)
    enPila.add(n)
    for (const m of aristas(n)) {
      if (!nodos.has(m)) continue
      if (!indice.has(m)) {
        visitar(m)
        bajo.set(n, Math.min(bajo.get(n) as number, bajo.get(m) as number))
      } else if (enPila.has(m)) {
        bajo.set(n, Math.min(bajo.get(n) as number, indice.get(m) as number))
      }
    }
    if (bajo.get(n) === indice.get(n)) {
      const componente: string[] = []
      let m: string | undefined
      do {
        m = pila.pop() as string
        enPila.delete(m)
        componente.unshift(m)
      } while (m !== n)
      resultado.push(componente)
    }
  }

  for (const n of nodos) if (!indice.has(n)) visitar(n)
  return resultado
}

/**
 * Reescribe las referencias a `anterior` en el texto de la fórmula, usando las posiciones del árbol.
 * De `Ventas[Importe]` se cambia solo el nombre de la tabla: la columna es el último corchete.
 */
function reemplazarReferencias(formula: string, arbol: Nodo, anterior: string, nuevo: string): string {
  const tramos: Nodo[] = []
  const recorrer = (n: Nodo) => {
    if (n.clase === 'referencia' && clave(n.nombre) === clave(anterior)) tramos.push(n)
    hijos(n).forEach(recorrer)
  }
  recorrer(arbol)
  // De atrás para adelante, para que las posiciones que quedan sigan valiendo.
  let r = formula
  for (const t of tramos.sort((a, b) => b.inicio - a.inicio)) {
    const fin = t.clase === 'referencia' && t.columna !== undefined ? t.inicio + formula.slice(t.inicio, t.fin).lastIndexOf('[') : t.fin
    r = r.slice(0, t.inicio) + nombreEnFormula(nuevo) + r.slice(fin)
  }
  return r
}

/** Reescribe los parámetros `:anterior` del SQL como `:nuevo`. */
function reemplazarParametros(sql: string, anterior: string, nuevo: string): string {
  let r = sql
  const tramos = parametrosConsulta(sql).filter((p) => clave(p.nombre) === clave(anterior))
  for (const t of tramos.reverse()) r = r.slice(0, t.inicio) + ':' + nuevo + r.slice(t.fin)
  return r
}

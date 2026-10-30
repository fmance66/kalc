<script setup lang="ts">
import Button from 'primevue/button'
import { computed, nextTick, ref, watch } from 'vue'
import ArbolFormula from '../components/ArbolFormula.vue'
import CampoBorrable from '../components/CampoBorrable.vue'
import { catalogo } from '../catalogo.ts'
import { inicioDeNombre, sugerir, type Candidata, type Opcion } from '../autocompletado.ts'
import { agregarAlHistorial, borrarHistorial, leerHistorial } from '../historial.ts'
import { TIPOS } from '../tipos.ts'
import VistaTabla from '../components/VistaTabla.vue'
import { CONTEXTO_EJEMPLOS, dependencias, evaluarComoTabla, formatear, nombreEnFormula, parsear, type Contexto, type Nodo, type Problema, type Tabla, type Valor } from 'kalc'

/**
 * Un clic y se prueban: un poco de cada cosa (reglas raras de Excel, texto, fechas, tablas y las
 * consultas al juzgado de ejemplo de las variables iniciales). Los casos raros, todos, están en la Ayuda.
 */
const EJEMPLOS = [
  '-2^2',
  '0,1+0,2=0,3',
  'SI(VERDADERO; 1; 1/0)',
  'EXTRAE("20-12345678-9"; 4; 8)',
  'TEXTO(HOY(); "dddd d ""de"" mmmm")',
  'REDONDEAR(1500 * 21%; 2)',
  'FILAS(Causas)',
  'FILTRAR(Causas; Causas[Monto] > 500000)',
  'SUMAR.SI(Causas[Fuero]; "Federal"; Causas[Monto])',
  'BUSCARV("Gómez"; Causas; 2; FALSO)',
  '"Fuero " & [Nombre del fuero] & ": " & FILAS(Jurisdicciones) & " jurisdicciones"',
  'TEXTO(CONTAR.SI(Expedientes[Estado]; 2) / [Expedientes vigentes]; "0%")',
  'ENTERO(MAX(Expedientes[Alta]) - MIN(Expedientes[Alta])) & " días"',
]

/**
 * La tabla de los ejemplos de la solapa Funciones (Causas), por nombre en minúsculas: un ejemplo
 * abierto desde ahí se calcula acá, y sirve para probar funciones de tablas sin la base.
 */
const TABLAS_EJEMPLO = new Map(Object.entries(CONTEXTO_EJEMPLOS.tablas).map(([nombre, tabla]) => [nombre.toLowerCase(), { nombre, tabla }]))


const NOMBRE_TIPO: Record<Valor['tipo'], string> = {
  numero: 'Número',
  texto: 'Texto',
  logico: 'Lógico',
  fecha: 'Fecha',
  error: 'Error',
  vacio: 'Vacío',
}

// Sin el = de Excel: acá no hace falta distinguir una fórmula de un valor (se acepta igual).
// Es de la App: así se conserva al cambiar de solapa, y el catálogo de funciones puede mandar un ejemplo.
const formula = defineModel<string>('formula', { default: '1+2*3' })
/**
 * La fórmula del último cálculo (botón Calcular o Enter): el resultado y el árbol son de esta.
 * Al volver a la solapa, la que quedó escrita se muestra calculada.
 */
const calculada = ref(formula.value)
/**
 * Las variables cargadas en la página Variables (al cambiar alguna, el resultado se actualiza), y
 * Causas, la tabla de los ejemplos de Funciones, salvo que haya una variable con ese nombre.
 */
const contexto = computed<Contexto>(() => ({ ...catalogo.value.contexto(), tablas: buscarTabla }))
function buscarTabla(nombre: string): Tabla | undefined {
  const c = catalogo.value
  return c.estado(nombre)?.tabla ?? (c.buscar(nombre) ? undefined : TABLAS_EJEMPLO.get(nombre.toLowerCase())?.tabla)
}
const tablasEjemplo = computed(() => [...TABLAS_EJEMPLO.values()].filter((t) => !catalogo.value.buscar(t.nombre)))
/** Los que usan variables que no están cargadas no se ofrecen: darían #¿NOMBRE?. */
const ejemplos = computed(() =>
  EJEMPLOS.filter((e) => {
    const r = parsear(e)
    return r.ok && dependencias(r.arbol).every((d) => catalogo.value.buscar(d) || TABLAS_EJEMPLO.has(d.toLowerCase()))
  }),
)
/** Lo que se ofrece al escribir `[`: las variables, con su tipo y valor, y las tablas de ejemplo. */
const candidatas = computed<Candidata[]>(() => [
  ...catalogo.value.variables().map((v) => {
    const estado = catalogo.value.estado(v.nombre)
    const tipo = TIPOS.find((t) => t.id === v.tipo)?.titulo ?? v.tipo
    const valor = estado?.tabla ? `${estado.tabla.filas.length} filas` : formatear(estado?.valor ?? { tipo: 'vacio' })
    return { nombre: v.nombre, detalle: `${tipo} · ${valor}` }
  }),
  ...tablasEjemplo.value.map((t) => ({ nombre: t.nombre, detalle: `Tabla de ejemplo · ${t.tabla.filas.length} filas` })),
])
/** Las fórmulas probadas (Calcular, Enter o un clic en "Probar"), la última primero. */
const historial = ref(leerHistorial())
/** El nodo del árbol bajo el puntero: se resalta su pedazo de fórmula. */
const resaltado = ref<Nodo | null>(null)

const parseo = computed(() => (calculada.value.trim() ? parsear(calculada.value) : null))
/** Un valor, o una tabla si la fórmula da varias celdas (FILTRAR, `Causas[Monto] * 2`). */
const calculo = computed<Tabla | Valor | null>(() => (parseo.value?.ok ? evaluarComoTabla(parseo.value.arbol, contexto.value) : null))
const resultado = computed(() => (calculo.value && 'tipo' in calculo.value ? calculo.value : null))
const resultadoTabla = computed(() => (calculo.value && 'columnas' in calculo.value ? calculo.value : null))
/**
 * Por qué puede fallar el resultado: los problemas de las variables que usa la fórmula, también a
 * través de otras (una tabla cuya consulta falló da #¡VALOR! sin decir nada), y los nombres que no
 * existen.
 */
const avisos = computed<{ nombre: string; texto: string }[]>(() => {
  if (!parseo.value?.ok) return []
  const c = catalogo.value
  const avisos: { nombre: string; texto: string }[] = []
  const vistas = new Set<string>()
  const pendientes = dependencias(parseo.value.arbol)
  while (pendientes.length > 0) {
    const nombre = pendientes.shift()!
    if (vistas.has(nombre.toLowerCase())) continue
    vistas.add(nombre.toLowerCase())
    const v = c.buscar(nombre)
    if (!v) {
      if (!TABLAS_EJEMPLO.has(nombre.toLowerCase())) avisos.push({ nombre, texto: 'no existe' })
      continue
    }
    const p = c.estado(v.nombre)?.problema
    if (p) avisos.push({ nombre: v.nombre, texto: textoProblema(p) })
    for (const f of [v.origen.clase === 'formula' ? v.origen.texto : '', ...(v.columnas ?? []).map((col) => col.formula)]) {
      const r = f.trim() ? parsear(f) : null
      if (r?.ok) pendientes.push(...dependencias(r.arbol))
    }
  }
  return avisos
})

function textoProblema(p: Problema): string {
  switch (p.clase) {
    case 'consulta':
      return `la consulta falló: ${p.mensaje}`
    case 'pendiente':
      return 'esperando la consulta a la base'
    case 'sintaxis':
      return `error de sintaxis: ${p.mensaje}`
    case 'ciclo':
      return `ciclo: ${p.camino.join(' → ')}`
    case 'faltan':
      return `usa variables que no existen: ${p.nombres.join(', ')}`
    case 'tipo':
      return p.mensaje
    case 'columna':
      return `columna ${p.columna || '(sin nombre)'}: ${p.mensaje}`
  }
}

/** Se cambió la fórmula después de calcular: el resultado queda atenuado hasta recalcular. */
const desactualizado = computed(() => formula.value !== calculada.value)
/** El error de sintaxis se muestra mientras la fórmula sea la calculada: su posición es de ese texto. */
const errorSintaxis = computed(() => (parseo.value && !parseo.value.ok && !desactualizado.value ? parseo.value.error : null))

/** La fórmula partida en tres para marcar un tramo: el del error de sintaxis o el nodo resaltado. */
const tramos = computed(() => {
  const marca = errorSintaxis.value ?? resaltado.value
  if (!marca) return null
  const f = calculada.value
  // Un error al final (falta algo) no abarca texto: se marca un espacio para que se vea.
  return { antes: f.slice(0, marca.inicio), marcado: f.slice(marca.inicio, marca.fin) || ' ', despues: f.slice(marca.fin) }
})

// Con el campo vacío (la "x") no queda nada que mostrar.
watch(formula, (f) => {
  if (!f.trim()) calcular()
})

/**
 * `texto` hace falta al cambiar la fórmula y calcular de una vez (Probar): la fórmula es un v-model
 * de la App y no cambia hasta que la App la actualiza; leerla acá daría la anterior.
 */
function calcular(texto = formula.value) {
  calculada.value = texto
  resaltado.value = null
  historial.value = agregarAlHistorial(historial.value, texto)
}

function olvidarHistorial() {
  borrarHistorial()
  historial.value = []
}

// --- Autocompletado: al escribir `[`, las variables (o las columnas, pegado a una tabla) ---

const campo = () => document.getElementById('formula') as HTMLInputElement | null
/** Dónde está el cursor en el campo; null con la lista cerrada (Escape, fuera del campo, al elegir). */
const cursor = ref<number | null>(null)
/** La opción marcada con las flechas. */
const marcada = ref(0)
/** Dónde empezaba el nombre al apretar Ctrl+Espacio: la lista sigue abierta mientras se escriba un nombre. */
const desde = ref<number | undefined>()
const sugerencias = computed(() => (cursor.value === null ? null : sugerir(formula.value, cursor.value, candidatas.value, buscarTabla, desde.value)))
const opciones = computed(() => sugerencias.value?.opciones ?? [])

// Cerrada la lista (un espacio, un operador, Escape), Ctrl+Espacio deja de valer: borrar no la reabre.
watch(sugerencias, (s) => {
  if (!s) desde.value = undefined
})

function seguirCursor() {
  cursor.value = campo()?.selectionStart ?? null
}

function alEscribir() {
  marcada.value = 0
  seguirCursor()
}

function alSoltarTecla(e: KeyboardEvent) {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) seguirCursor()
}

/** Ctrl+Espacio: las variables para el nombre que se está escribiendo, sin hacer falta el `[`. */
function abrirLista() {
  seguirCursor()
  marcada.value = 0
  if (cursor.value !== null) desde.value = inicioDeNombre(formula.value, cursor.value) ?? undefined
}

function alApretarTecla(e: KeyboardEvent) {
  if (e.ctrlKey && (e.key === ' ' || e.code === 'Space')) {
    e.preventDefault()
    abrirLista()
    return
  }
  const n = opciones.value.length
  if (n === 0) {
    if (e.key === 'Enter') {
      e.preventDefault()
      calcular()
    }
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') marcada.value = (marcada.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  else if (e.key === 'Enter' || e.key === 'Tab') elegir(opciones.value[marcada.value]!)
  else if (e.key === 'Escape') cursor.value = null
  else return
  e.preventDefault()
}

function elegir(opcion: Opcion) {
  const s = sugerencias.value
  if (!s) return
  const f = formula.value
  formula.value = f.slice(0, s.inicio) + opcion.insertar + f.slice(s.fin)
  cursor.value = null
  const posicion = s.inicio + opcion.insertar.length
  void nextTick(() => {
    campo()?.focus()
    campo()?.setSelectionRange(posicion, posicion)
  })
}

// Con muchas variables la lista se desplaza: la marcada tiene que quedar a la vista.
watch(marcada, () => nextTick(() => document.querySelector('.sugerencia-marcada')?.scrollIntoView?.({ block: 'nearest' })))

function probar(ejemplo: string) {
  formula.value = ejemplo
  cursor.value = null
  calcular(ejemplo)
}

/** Agrega la variable al final de la fórmula, con corchetes si su nombre los necesita. */
function insertar(nombre: string) {
  const f = formula.value.trimEnd()
  formula.value = `${f}${f && !/[(;&+\-*/^=<>]$/.test(f) ? ' ' : ''}${nombreEnFormula(nombre)}`
  document.getElementById('formula')?.focus()
}
</script>

<template>
  <div class="probador">
    <section class="panel">
      <label for="formula" class="panel-titulo d-block">
        Fórmula <span class="texto-atenuado small fw-normal">· escribí <code>[</code> o apretá <kbd>Ctrl</kbd>+<kbd>Espacio</kbd> para elegir una variable</span>
      </label>
      <div class="formula-fila">
        <div class="formula-campo">
          <CampoBorrable
            id="formula"
            v-model="formula"
            class="formula-entrada"
            :invalid="!!errorSintaxis"
            spellcheck="false"
            placeholder="SI(A>1,5; &quot;alto&quot;; &quot;bajo&quot;)"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="formula-sugerencias"
            :aria-expanded="opciones.length > 0"
            :aria-activedescendant="opciones.length > 0 ? `sugerencia-${marcada}` : undefined"
            @input="alEscribir"
            @click="seguirCursor"
            @keyup="alSoltarTecla"
            @keydown="alApretarTecla"
            @blur="cursor = null"
          />
          <!-- mousedown.prevent: que el campo no pierda el foco (y cierre la lista) antes del clic -->
          <ul v-if="opciones.length > 0" id="formula-sugerencias" class="sugerencias" role="listbox" data-prueba="sugerencias">
            <li class="sugerencias-titulo">{{ sugerencias?.clase === 'columna' ? `Columnas de ${sugerencias.tabla}` : 'Variables' }}</li>
            <li
              v-for="(o, i) in opciones"
              :id="`sugerencia-${i}`"
              :key="o.etiqueta"
              role="option"
              class="sugerencia"
              :class="{ 'sugerencia-marcada': i === marcada }"
              :aria-selected="i === marcada"
              @mousedown.prevent="elegir(o)"
              @mouseenter="marcada = i"
            >
              <span class="sugerencia-nombre">{{ o.etiqueta }}</span>
              <span v-if="o.detalle" class="sugerencia-detalle">{{ o.detalle }}</span>
            </li>
          </ul>
        </div>
        <Button icon="pi pi-calculator" label="Calcular" class="boton-calcular" title="Calcular (Enter)" @click="calcular()" />
      </div>
      <!-- El nodo del árbol bajo el puntero se marca en la copia de la fórmula que está en el árbol. -->
      <div v-if="tramos && errorSintaxis" class="formula-marcada formula-marcada-error" aria-hidden="true">
        {{ tramos.antes }}<mark>{{ tramos.marcado }}</mark>{{ tramos.despues }}
      </div>
      <div v-if="errorSintaxis" class="error-sintaxis" role="alert">{{ errorSintaxis.mensaje }}</div>

      <!-- Lo que se fue probando; hasta probar algo (o después de borrarlo), los ejemplos. -->
      <div class="ejemplos" :data-historial="historial.length > 0 || undefined">
        <span class="texto-atenuado" :title="historial.length > 0 ? 'Lo último que probaste, guardado en este navegador' : undefined">Probar:</span>
        <button v-for="e in historial.length > 0 ? historial : ejemplos" :key="e" type="button" class="ejemplo" @click="probar(e)">{{ e }}</button>
        <Button v-if="historial.length > 0" label="Borrar historial" link size="small" class="borrar-historial" @click="olvidarHistorial" />
      </div>
      <div v-if="tablasEjemplo.length > 0" class="ejemplos" data-prueba="tablas-ejemplo">
        <span class="texto-atenuado">Tabla de ejemplo:</span>
        <button
          v-for="t in tablasEjemplo"
          :key="t.nombre"
          type="button"
          class="ejemplo ejemplo-variable"
          :title="`Columnas: ${t.tabla.columnas.join(', ')} · ${t.tabla.filas.length} filas`"
          @click="insertar(t.nombre)"
        >
          {{ t.nombre }}
        </button>
      </div>
    </section>

    <section
      v-if="resultado"
      class="panel resultado"
      :class="{ 'resultado-error': resultado.tipo === 'error', 'resultado-desactualizado': desactualizado }"
    >
      <div class="resultado-valor" data-prueba="resultado">{{ formatear(resultado) }}</div>
      <div class="texto-atenuado small">
        {{ NOMBRE_TIPO[resultado.tipo] }}
        <template v-if="desactualizado"> · de <code>{{ calculada }}</code>: la fórmula cambió, Enter para recalcular</template>
      </div>
      <ul v-if="avisos.length > 0" class="avisos-probador" data-prueba="avisos">
        <li v-for="a in avisos" :key="a.nombre"><strong>{{ a.nombre }}</strong>: {{ a.texto }}</li>
      </ul>
    </section>

    <!-- Una fórmula que da una tabla: en una variable, la de tipo tabla; acá se ve entera. -->
    <section v-if="resultadoTabla" class="panel resultado" :class="{ 'resultado-desactualizado': desactualizado }" data-prueba="resultado-tabla">
      <VistaTabla :tabla="resultadoTabla" titulo="Tabla" abierta />
      <div v-if="desactualizado" class="texto-atenuado small">De <code>{{ calculada }}</code>: la fórmula cambió, Enter para recalcular</div>
      <ul v-if="avisos.length > 0" class="avisos-probador" data-prueba="avisos">
        <li v-for="a in avisos" :key="a.nombre"><strong>{{ a.nombre }}</strong>: {{ a.texto }}</li>
      </ul>
    </section>

    <section v-if="parseo?.ok" class="panel" :class="{ 'resultado-desactualizado': desactualizado }">
      <h2 class="panel-titulo">Árbol de la fórmula</h2>
      <!-- Fija arriba mientras se recorre el árbol: con un resultado largo, el campo queda lejos. -->
      <div class="formula-marcada arbol-formula" aria-hidden="true" data-prueba="arbol-formula"><template v-if="tramos">{{ tramos.antes }}<mark>{{ tramos.marcado }}</mark>{{ tramos.despues }}</template><template v-else>{{ calculada }}</template></div>
      <p class="texto-atenuado small">Pasá el mouse por un renglón y se marca en la fórmula la parte que le corresponde.</p>
      <ul class="arbol arbol-raiz">
        <ArbolFormula :nodo="parseo.arbol" :formula="calculada" :contexto="contexto" @resaltar="resaltado = $event" />
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { evaluarComoTabla, formatear, hijos, numeroATexto, type Contexto, type Nodo, type Tabla } from 'kalc'

/**
 * Un nodo del árbol de la fórmula y sus hijos: qué es, el pedazo de texto que abarca y cuánto
 * vale. Sirve para ver cómo quedaron las precedencias (`-2^2` es `(-2)^2`).
 */
const props = defineProps<{ nodo: Nodo; formula: string; contexto: Contexto }>()
const emit = defineEmits<{ resaltar: [nodo: Nodo | null] }>()

/** Si el nombre es una tabla del contexto: para el parser es un nombre más, como una variable. */
function tablaDe(nombre: string): Tabla | undefined {
  const { tablas } = props.contexto
  if (typeof tablas === 'function') return tablas(nombre)
  return Object.entries(tablas ?? {}).find(([k]) => k.toLowerCase() === nombre.toLowerCase())?.[1]
}

const etiqueta = computed(() => {
  const n = props.nodo
  switch (n.clase) {
    case 'numero':
      return { tipo: 'Número', texto: numeroATexto(n.valor) }
    case 'texto':
      return { tipo: 'Texto', texto: `"${n.valor}"` }
    case 'logico':
      return { tipo: 'Lógico', texto: n.valor ? 'VERDADERO' : 'FALSO' }
    case 'error':
      return { tipo: 'Error', texto: n.valor }
    case 'referencia': {
      if (n.columna !== undefined) return { tipo: 'Columna', texto: `${n.nombre}[${n.columna}]` }
      const tabla = tablaDe(n.nombre)
      if (tabla) return { tipo: 'Tabla', texto: n.nombre, detalle: `${tabla.filas.length} filas × ${tabla.columnas.length} columnas` }
      return { tipo: 'Variable', texto: n.nombre }
    }
    case 'omitido':
      return { tipo: 'Omitido', texto: '' }
    case 'unario':
      return { tipo: 'Unario', texto: n.operador }
    case 'porcentaje':
      return { tipo: 'Porcentaje', texto: '%' }
    case 'binario':
      return { tipo: 'Operador', texto: n.operador }
    case 'llamada':
      return { tipo: 'Función', texto: `${n.nombre}()` }
  }
})

/** Las hojas ya muestran su valor en la etiqueta. */
const esHoja = computed(() => hijos(props.nodo).length === 0)
const texto = computed(() => props.formula.slice(props.nodo.inicio, props.nodo.fin))
/** Lo que vale esa parte: un valor, o el tamaño si da una tabla (`Causas[Monto] * 2`). */
const valor = computed(() => {
  const r = evaluarComoTabla(props.nodo, props.contexto)
  return 'columnas' in r ? `tabla de ${r.filas.length} filas × ${r.columnas.length} columnas` : formatear(r)
})
</script>

<template>
  <li class="arbol-nodo">
    <span class="arbol-fila" @mouseenter="emit('resaltar', nodo)" @mouseleave="emit('resaltar', null)">
      <span class="arbol-tipo">{{ etiqueta.tipo }}</span>
      <code class="arbol-etiqueta">{{ etiqueta.texto }}</code>
      <span v-if="'detalle' in etiqueta" class="arbol-valor">{{ etiqueta.detalle }}</span>
      <template v-if="!esHoja">
        <code class="arbol-texto">{{ texto }}</code>
        <span class="arbol-valor">= {{ valor }}</span>
      </template>
    </span>
    <ul v-if="!esHoja" class="arbol">
      <ArbolFormula v-for="(h, i) in hijos(nodo)" :key="i" :nodo="h" :formula="formula" :contexto="contexto" @resaltar="emit('resaltar', $event)" />
    </ul>
  </li>
</template>

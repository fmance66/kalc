<script setup lang="ts">
import { computed } from 'vue'
import { formatear, type Tabla } from 'kalc'

/**
 * Una tabla (de una variable de tipo tabla, o el resultado de una fórmula) plegada: el tamaño, y al
 * desplegarla las primeras filas. Con miles de filas, dibujarlas todas trabaría la página.
 * `abierta`: ya desplegada (en el Probador, la tabla es el resultado).
 */
const props = withDefaults(defineProps<{ tabla: Tabla; titulo?: string; maximo?: number; abierta?: boolean }>(), { titulo: '', maximo: 50, abierta: false })

const filas = computed(() => props.tabla.filas.slice(0, props.maximo))
const resto = computed(() => props.tabla.filas.length - filas.value.length)
const tamanio = computed(() => {
  const { filas: f, columnas: c } = props.tabla
  return `${f.length} fila${f.length === 1 ? '' : 's'} × ${c.length} columna${c.length === 1 ? '' : 's'}`
})
</script>

<template>
  <details class="vista-tabla" :open="abierta">
    <summary>
      <template v-if="titulo">{{ titulo }} · </template>{{ tamanio }}
    </summary>
    <div class="vista-tabla-datos">
      <table class="tabla tabla-bordeada">
        <thead>
          <tr>
            <th v-for="c in tabla.columnas" :key="c" scope="col">{{ c }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(fila, i) in filas" :key="i">
            <td v-for="(v, j) in fila" :key="j" :class="{ 'text-end': v.tipo === 'numero', 'text-danger': v.tipo === 'error' }">{{ formatear(v) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="resto > 0" class="texto-atenuado small mt-1">y {{ resto }} filas más</div>
    </div>
  </details>
</template>

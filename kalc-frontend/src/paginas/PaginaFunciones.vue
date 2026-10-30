<script setup lang="ts">
import { computed } from 'vue'
import { busquedaFunciones as busqueda } from '../busquedas.ts'
import Tag from 'primevue/tag'
import CampoBorrable from '../components/CampoBorrable.vue'
import Vacio from '../components/Vacio.vue'
import VistaTabla from '../components/VistaTabla.vue'
import { CONTEXTO_EJEMPLOS, evaluarComoTabla, formatear, listarFunciones, parsear, type Categoria, type DefinicionFuncion, type Tabla, type Valor } from 'kalc'

const emit = defineEmits<{ probar: [formula: string] }>()

/** En el orden en que suelen hacer falta. Las funciones propias (sin categoría) van al final. */
const CATEGORIAS: (Categoria | 'Propias')[] = ['Lógicas', 'Matemáticas', 'Estadísticas', 'Búsqueda', 'Matrices', 'Texto', 'Fechas', 'Información', 'Propias']

/** La tabla que usan los ejemplos de Estadísticas, Búsqueda y Matrices. */
const TABLAS_EJEMPLO = Object.entries(CONTEXTO_EJEMPLOS.tablas)

/** Para buscar sin distinguir mayúsculas ni acentos: "ano" encuentra AÑO. */
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * El ejemplo evaluado: un valor, o una tabla (las de Matrices). Si alguien registra uno con un error
 * de sintaxis, no se muestra nada.
 */
function resultadoDe(f: DefinicionFuncion): Valor | Tabla | null {
  if (!f.ejemplo) return null
  const r = parsear(f.ejemplo)
  return r.ok ? evaluarComoTabla(r.arbol, CONTEXTO_EJEMPLOS) : null
}

const grupos = computed(() => {
  const q = normalizar(busqueda.value.trim())
  const coincide = (f: DefinicionFuncion) =>
    !q || [f.nombre, ...(f.alias ?? []), f.descripcion ?? ''].some((t) => normalizar(t).includes(q))
  const funciones = listarFunciones()
    .filter(coincide)
    .map((f) => ({ f, resultado: resultadoDe(f) }))
  return CATEGORIAS.map((categoria) => ({
    categoria,
    filas: funciones.filter(({ f }) => (f.categoria ?? 'Propias') === categoria),
  })).filter((g) => g.filas.length > 0)
})
</script>

<template>
  <div class="funciones">
    <section class="panel">
      <label for="buscar-funcion" class="panel-titulo d-block">Funciones</label>
      <CampoBorrable id="buscar-funcion" v-model="busqueda" placeholder="Buscar por nombre (SI, IF) o por lo que hace" spellcheck="false" />
      <p class="texto-atenuado small mt-2 mb-0">
        Se escriben con los nombres de Excel en castellano o en inglés, y los argumentos se separan con <code>;</code>. Los
        ejemplos se calculan en vivo: un clic y se abren en el Probador. Los de tablas usan esta de ejemplo:
      </p>
      <VistaTabla v-for="[nombre, tabla] in TABLAS_EJEMPLO" :key="nombre" :tabla="tabla" :titulo="nombre" class="mt-1" />
    </section>

    <section v-for="g in grupos" :key="g.categoria" class="panel">
      <h2 class="panel-titulo">{{ g.categoria }}</h2>
      <div class="table-responsive">
        <table class="tabla tabla-funciones">
          <thead>
            <tr>
              <th scope="col">Función</th>
              <th scope="col">Qué hace</th>
              <th scope="col">Ejemplo</th>
              <th scope="col">Resultado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ f, resultado } in g.filas" :key="f.nombre" :data-funcion="f.nombre">
              <td>
                <code class="funcion-firma">{{ f.firma ?? `${f.nombre}()` }}</code>
                <div v-if="f.alias?.length || f.volatil || f.propia" class="texto-atenuado small">
                  <span v-if="f.alias?.length">{{ f.alias.join(', ') }}</span>
                  <Tag v-if="f.volatil" value="volátil" severity="secondary" class="ms-1" title="Da otro resultado cada vez: se recalcula siempre" />
                  <Tag v-if="f.propia" value="propia de Kalc" severity="secondary" class="ms-1" title="No existe en Excel: la descripción dice cómo se escribe allá" />
                </div>
              </td>
              <td class="small">{{ f.descripcion }}</td>
              <td>
                <button v-if="f.ejemplo" type="button" class="ejemplo" title="Abrir en el Probador" @click="emit('probar', f.ejemplo)">
                  {{ f.ejemplo }}
                </button>
              </td>
              <td>
                <VistaTabla v-if="resultado && 'columnas' in resultado" :tabla="resultado" class="funcion-resultado-tabla" />
                <code v-else-if="resultado" class="funcion-resultado" :class="{ 'text-danger': resultado.tipo === 'error' }">
                  {{ formatear(resultado) }}
                </code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="grupos.length === 0" class="panel">
      <Vacio icono="pi-search-minus" titulo="Sin resultados" :subtitulo="`Ninguna función coincide con «${busqueda}».`" />
    </section>
  </div>
</template>

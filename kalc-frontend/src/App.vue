<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Toolbar from 'primevue/toolbar'
import { computed, ref } from 'vue'
import { errorPersistencia, reemplazarVariables, reintentar, sinVariablesGuardadas } from './catalogo.ts'
import { leerVersionApi, textoVersionApi } from './persistencia/api.ts'
import BotonSubir from './components/BotonSubir.vue'
import EnlaceRepositorio from './components/EnlaceRepositorio.vue'
import PaginaAyuda from './paginas/PaginaAyuda.vue'
import PaginaFunciones from './paginas/PaginaFunciones.vue'
import PaginaProbador from './paginas/PaginaProbador.vue'
import PaginaVariables from './paginas/PaginaVariables.vue'
import { VARIABLES_INICIALES } from './pruebas/variablesIniciales.ts'

type Vista = 'probador' | 'variables' | 'funciones' | 'ayuda'

/**
 * Las solapas, en orden de uso: probar una fórmula, después con variables propias; Funciones y
 * Ayuda son de consulta. Botones propios: cada página se monta solo mientras está abierta.
 */
const SOLAPAS: { id: Vista; titulo: string; icono: string }[] = [
  { id: 'probador', titulo: 'Probador', icono: 'pi-calculator' },
  { id: 'variables', titulo: 'Variables', icono: 'pi-table' },
  { id: 'funciones', titulo: 'Funciones', icono: 'pi-book' },
  { id: 'ayuda', titulo: 'Ayuda', icono: 'pi-question-circle' },
]

/** './' en el build (subcarpeta del servidor), '/' en desarrollo. */
const baseUrl = import.meta.env.BASE_URL
const vista = ref<Vista>('probador')
/**
 * La fórmula del Probador. Vive acá y no en la página para que no se pierda al cambiar de solapa
 * (dura hasta cerrar o recargar la app); el catálogo de funciones y la Ayuda la reemplazan.
 */
const formula = ref('1+2*3')
/** La de kalc-backend, cuando responde: así el pie confirma qué quedó publicado de las dos partes. */
const versionApi = ref<string | null>(null)
const version = computed(() => [textoVersion(), versionApi.value].filter(Boolean).join(' · '))
if (import.meta.env.VITE_API) void leerVersionApi(import.meta.env.VITE_API).then((v) => (versionApi.value = v && textoVersionApi(v)))
/** Sin variables guardadas al arrancar (base vacía, o vaciada a propósito): se pregunta una vez. */
const preguntarIniciales = ref(sinVariablesGuardadas.value)

function probar(ejemplo: string) {
  formula.value = ejemplo
  vista.value = 'probador'
}

async function cargarIniciales() {
  preguntarIniciales.value = false
  await reemplazarVariables(VARIABLES_INICIALES)
}

/**
 * La versión de package.json (`npm version` la sube). El build agrega el commit y la fecha, para
 * confirmar qué quedó publicado; en desarrollo no, porque el commit se lee una sola vez al
 * arrancar Vite y quedaría viejo. Compilado fuera de un repositorio (un .zip) no hay commit.
 */
function textoVersion() {
  const { VITE_VERSION: numero, VITE_VERSION_COMMIT: commit, VITE_VERSION_FECHA: fecha } = import.meta.env
  if (import.meta.env.DEV) return `v${numero}`
  return commit ? `v${numero} · ${commit} del ${fecha}` : `v${numero} del ${fecha}`
}
</script>

<template>
  <Toolbar class="barra">
    <template #start>
      <a :href="baseUrl" class="barra-inicio" @click.prevent="vista = 'probador'">
        <img :src="`${baseUrl}icono.svg`" alt="" class="barra-logo" width="32" height="32" />
        <span class="barra-titulo"><strong>Kalc</strong> - Motor de fórmulas</span>
      </a>
    </template>
  </Toolbar>

  <main class="app-main">
    <ul class="solapas">
      <!-- Ayuda, aparte a la derecha: las otras tres son para trabajar; esta, para consultar. -->
      <li v-for="s in SOLAPAS" :key="s.id" :class="{ 'ms-auto': s.id === 'ayuda' }">
        <button type="button" class="nav-link" :class="{ active: vista === s.id }" :aria-current="vista === s.id" @click="vista = s.id">
          <i :class="['pi', s.icono]" aria-hidden="true"></i>{{ s.titulo }}
        </button>
      </li>
    </ul>

    <Message v-if="errorPersistencia" severity="error" class="aviso-persistencia" data-prueba="error-persistencia">
      <span v-if="errorPersistencia.al === 'cargar'">No se pudieron cargar las variables guardadas ({{ errorPersistencia.mensaje }}).</span>
      <span v-else>No se guardó el último cambio ({{ errorPersistencia.mensaje }}): lo que ves en pantalla no quedó guardado.</span>
      <Button label="Reintentar" size="small" severity="danger" outlined class="ms-2" @click="reintentar" />
    </Message>

    <PaginaProbador v-if="vista === 'probador'" v-model:formula="formula" />
    <PaginaVariables v-else-if="vista === 'variables'" />
    <PaginaFunciones v-else-if="vista === 'funciones'" @probar="probar" />
    <PaginaAyuda v-else @probar="probar" />
  </main>

  <Dialog v-model:visible="preguntarIniciales" modal header="Sin variables" class="modal-pregunta">
    No hay variables guardadas. ¿Cargar las variables de ejemplo?
    <template #footer>
      <Button label="No" severity="secondary" outlined @click="preguntarIniciales = false" />
      <Button label="Sí, cargarlas" @click="cargarIniciales" />
    </template>
  </Dialog>

  <footer class="pie">
    <div>
      <strong>Kalc</strong> — Motor de fórmulas
      <div class="pie-version">versión {{ version }}</div>
    </div>
    <EnlaceRepositorio />
  </footer>

  <BotonSubir />
</template>

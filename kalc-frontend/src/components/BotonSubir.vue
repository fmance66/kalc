<script setup lang="ts">
/**
 * El botón flotante para volver arriba, en la solapa que esté abierta. Aparece después de bajar un
 * poco y se va al volver arriba. Sin @vueuse: un listener de scroll.
 */
import Button from 'primevue/button'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const visible = ref(false)
const actualizar = () => (visible.value = window.scrollY > 300)

function subir() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  actualizar()
  window.addEventListener('scroll', actualizar, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', actualizar))
</script>

<template>
  <Transition name="boton-subir">
    <Button v-if="visible" icon="pi pi-angle-double-up" rounded class="boton-subir" title="Volver arriba" aria-label="Volver arriba" @click="subir" />
  </Transition>
</template>

<style scoped>
.boton-subir {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 1030;
}

.boton-subir-enter-active,
.boton-subir-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.boton-subir-enter-from,
.boton-subir-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>

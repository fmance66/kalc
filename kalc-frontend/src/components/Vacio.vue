<script setup lang="ts">
/** Lo que se muestra en lugar de una lista vacía: un ícono, el título y qué hacer. */
defineProps<{ icono: string; titulo: string; subtitulo?: string }>()
</script>

<template>
  <div class="vacio">
    <i :class="['pi', icono, 'vacio-icono']" aria-hidden="true"></i>
    <strong>{{ titulo }}</strong>
    <p v-if="subtitulo">{{ subtitulo }}</p>
  </div>
</template>

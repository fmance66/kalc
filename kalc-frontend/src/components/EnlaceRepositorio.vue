<script setup lang="ts">
/**
 * El repositorio del proyecto (el README explica las tres partes). Sale de `repository` en
 * package.json (lo pone vite.config.ts): si no está, no se muestra.
 */
const URL_REPOSITORIO = import.meta.env.VITE_REPOSITORIO
</script>

<template>
  <a v-if="URL_REPOSITORIO" :href="URL_REPOSITORIO" target="_blank" rel="noopener noreferrer" class="enlace-repositorio" data-prueba="enlace-repositorio">
    <i class="pi pi-github" aria-hidden="true"></i>
    Kalc — fórmulas al máximo nivel
  </a>
</template>

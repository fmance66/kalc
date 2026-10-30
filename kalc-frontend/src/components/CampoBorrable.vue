<script setup lang="ts">
import InputText from 'primevue/inputtext'
import { ref } from 'vue'

// Los atributos (id, placeholder, list, eventos) van al <input>, no al contenedor.
defineOptions({ inheritAttrs: false })

const valor = defineModel<string>({ required: true })
const campo = ref<{ $el: HTMLInputElement }>()

function borrar() {
  valor.value = ''
  campo.value?.$el.focus()
}
</script>

<template>
  <div class="campo-borrable">
    <InputText ref="campo" v-model="valor" type="text" autocomplete="off" fluid v-bind="$attrs" />
    <button v-if="valor" type="button" class="campo-borrar" title="Borrar" aria-label="Borrar" tabindex="-1" @click="borrar">
      <i class="pi pi-times" aria-hidden="true"></i>
    </button>
  </div>
</template>

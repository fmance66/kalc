import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { defineComponent, h, type Component } from 'vue'

/**
 * Montaje para los tests de la interfaz: PrimeVue sin tema (los estilos no hacen falta para probar
 * el comportamiento). Dialog se reemplaza por un elemento simple: el de PrimeVue se dibuja fuera
 * del componente (en el body), y así el test lo encuentra adentro.
 */

/** Abierto con v-model:visible; el título, el contenido y los botones del pie. */
const Dialog = defineComponent({
  props: { visible: Boolean, header: String },
  emits: ['update:visible'],
  setup: (props, { slots }) => () =>
    props.visible ? h('div', { role: 'dialog', class: 'modal' }, [h('strong', props.header), slots.default?.(), slots.footer?.()]) : null,
})

export const STUBS: Record<string, Component> = { Dialog }

export function montar<T extends Component>(componente: T, opciones: Parameters<typeof mount<T>>[1] = {}) {
  return mount(componente, {
    ...opciones,
    global: {
      ...opciones.global,
      plugins: [[PrimeVue, { unstyled: true }], ...(opciones.global?.plugins ?? [])],
      stubs: { ...STUBS, ...opciones.global?.stubs },
    },
  })
}

/** El botón que contiene el texto. */
export function boton(envoltorio: ReturnType<typeof mount>, texto: string) {
  const encontrado = envoltorio.findAll('button').find((b) => b.text().includes(texto))
  if (!encontrado) throw new Error(`No hay un botón "${texto}"`)
  return encontrado
}

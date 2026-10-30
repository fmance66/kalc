import Aura from '@primeuix/themes/aura'
import 'primeicons/primeicons.css'
import PrimeVue from 'primevue/config'
import { createApp } from 'vue'
import App from './App.vue'
import { cargarVariables } from './catalogo.ts'
import { cargarConexiones } from './conexiones.ts'
import './estilos.css'

// Las variables guardadas se cargan antes de montar: el Probador abre ya con ellas. Si la API no
// responde, la app abre igual, sin variables y con el aviso.
await cargarVariables()
// Las conexiones solo hacen falta para editar una consulta: no se espera por ellas. En el build
// publicado ya las trajo cargarVariables, para ocultar las consultas que el servidor no puede correr.
if (import.meta.env.DEV) void cargarConexiones()
// Siempre en claro: los colores propios de estilos.css son para fondo claro.
createApp(App)
  .use(PrimeVue, { theme: { preset: Aura, options: { darkModeSelector: false } } })
  .mount('#app')

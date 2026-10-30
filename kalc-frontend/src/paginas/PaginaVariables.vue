<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import { computed, nextTick, ref } from 'vue'
import { busquedaVariables as busqueda } from '../busquedas.ts'
import CampoBorrable from '../components/CampoBorrable.vue'
import FilaVariable from '../components/FilaVariable.vue'
import Vacio from '../components/Vacio.vue'
import { catalogo, definirVariable, recalcularTodo, recalculadas, reemplazarVariables } from '../catalogo.ts'
import { escribirDatos, esVariable, formatear, validarNombre, type Variable } from 'kalc'
import { VERSION_FORMATO } from '../persistencia/localStorage.ts'
import { TIPOS } from '../tipos.ts'

const filas = computed(() => {
  const c = catalogo.value
  const marcadas = new Set(recalculadas.value.map((n) => n.toLowerCase()))
  // `indice` es la posición en la lista completa: la clave de la fila no cambia al filtrar.
  return c.variables().map((variable, indice) => ({ variable, indice, estado: c.estado(variable.nombre), recalculada: marcadas.has(variable.nombre.toLowerCase()) }))
})

/** Para buscar sin distinguir mayúsculas ni acentos: "alicuota" encuentra Alícuota. */
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Lo que se ve escrito en la fila: el valor de la constante, la fórmula, el SQL o los datos, y las columnas calculadas. */
function contenidoDe({ origen, columnas }: Variable): string {
  const calculadas = (columnas ?? []).map((c) => `${c.nombre} ${c.formula}`).join(' ')
  if (origen.clase === 'formula') return `${origen.texto} ${calculadas}`
  if (origen.clase === 'consulta') return `${origen.sql} ${calculadas}`
  if (origen.clase === 'datos') return `${escribirDatos(origen.tabla)} ${calculadas}`
  return formatear(origen.valor)
}

type Columna = 'nombre' | 'tipo'
/** Sin columna, el orden en que se guardaron. Un clic ordena, otro invierte, otro vuelve. */
const orden = ref<{ columna: Columna; asc: boolean } | null>(null)

function ordenarPor(columna: Columna) {
  const o = orden.value
  orden.value = o?.columna !== columna ? { columna, asc: true } : o.asc ? { columna, asc: false } : null
}

const tituloDeTipo = (v: Variable) => TIPOS.find((t) => t.id === v.tipo)?.titulo ?? v.tipo
const comparar = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true })
const flecha = (columna: Columna) => (orden.value?.columna !== columna ? '' : orden.value.asc ? '▲' : '▼')
const ariaOrden = (columna: Columna) => (orden.value?.columna !== columna ? 'none' : orden.value.asc ? 'ascending' : 'descending')

/** Las que coinciden con la búsqueda por nombre, descripción o valor o fórmula, en el orden elegido. */
const visibles = computed(() => {
  const q = normalizar(busqueda.value.trim())
  const encontradas = q ? filas.value.filter(({ variable: v }) => [v.nombre, v.descripcion ?? '', contenidoDe(v)].some((t) => normalizar(t).includes(q))) : filas.value
  const o = orden.value
  if (!o) return encontradas
  // Por tipo, y dentro de cada tipo por nombre.
  const clave = (a: Variable, b: Variable) => (o.columna === 'tipo' ? comparar(tituloDeTipo(a), tituloDeTipo(b)) : 0) || comparar(a.nombre, b.nombre)
  return [...encontradas].sort((a, b) => (o.asc ? clave(a.variable, b.variable) : clave(b.variable, a.variable)))
})

const tabla = ref<HTMLTableElement>()
const archivo = ref<HTMLInputElement>()
/** Resultado de importar. */
const mensaje = ref<{ variante: 'success' | 'error'; texto: string } | null>(null)

async function agregar() {
  // La nueva va al final y tiene que verse, aunque no coincida con la búsqueda.
  busqueda.value = ''
  let n = filas.value.length + 1
  while (catalogo.value.buscar(`Variable${n}`)) n++
  await definirVariable({ nombre: `Variable${n}`, tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'vacio' } } })
  await nextTick()
  const campo = tabla.value?.querySelector<HTMLInputElement>('tbody tr:last-child .celda-nombre')
  campo?.focus()
  campo?.select()
}

function exportar() {
  const json = JSON.stringify({ version: VERSION_FORMATO, variables: catalogo.value.variables() }, null, 2)
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  enlace.download = 'variables.json'
  enlace.click()
  URL.revokeObjectURL(enlace.href)
}

/** Acepta lo que exporta esta página (`{ version, variables }`) o directamente una lista. */
async function importar(e: Event) {
  const entrada = e.target as HTMLInputElement
  const elegido = entrada.files?.[0]
  entrada.value = '' // para poder volver a elegir el mismo archivo
  if (!elegido) return
  let datos: unknown
  try {
    datos = JSON.parse(await elegido.text())
  } catch {
    mensaje.value = { variante: 'error', texto: `${elegido.name} no es un JSON válido.` }
    return
  }
  const lista: unknown[] = Array.isArray(datos) ? datos : Array.isArray((datos as { variables?: unknown })?.variables) ? (datos as { variables: unknown[] }).variables : []
  const validas = lista.filter((v): v is Variable => esVariable(v) && validarNombre(v.nombre) === null)
  if (validas.length === 0) {
    mensaje.value = { variante: 'error', texto: `${elegido.name} no tiene variables para importar.` }
    return
  }
  if (filas.value.length > 0 && !confirm(`Se reemplazan las ${filas.value.length} variables actuales por las ${validas.length} del archivo. ¿Seguir?`)) return
  await reemplazarVariables(validas)
  const descartadas = lista.length - validas.length
  mensaje.value = {
    variante: 'success',
    texto: `Se importaron ${validas.length} variables` + (descartadas ? ` (${descartadas} descartadas: no tenían el formato esperado).` : '.'),
  }
}
</script>

<template>
  <div class="variables">
    <section class="panel">
      <div class="variables-encabezado">
        <h2 class="panel-titulo mb-0">Variables</h2>
        <!-- CampoBorrable pasa los atributos (también class) al input: el ancho va en un contenedor. -->
        <div class="variables-busqueda">
          <i class="pi pi-search variables-lupa" aria-hidden="true"></i>
          <CampoBorrable
            v-model="busqueda"
            placeholder="Nombre, descripción o fórmula"
            aria-label="Buscar variables"
            spellcheck="false"
            :disabled="filas.length === 0"
          />
        </div>
        <div class="variables-acciones">
          <Button icon="pi pi-plus" label="Agregar" size="small" @click="agregar" />
          <Button
            icon="pi pi-refresh"
            label="Recalcular"
            size="small"
            outlined
            title="Recalcular todo: las funciones volátiles (como HOY) y las consultas a la base"
            :disabled="filas.length === 0"
            @click="recalcularTodo"
          />
          <Button icon="pi pi-upload" label="Importar" size="small" outlined @click="archivo?.click()" />
          <Button icon="pi pi-download" label="Exportar" size="small" outlined :disabled="filas.length === 0" @click="exportar" />
          <input ref="archivo" type="file" accept=".json,application/json" class="d-none" data-prueba="archivo" @change="importar" />
        </div>
      </div>
      <p class="texto-atenuado small mt-2 mb-0">
        Cada variable es una constante, una fórmula que usa otras o una consulta a la base (un SELECT que devuelve un solo
        valor; <code>:Nombre</code> usa otra variable como parámetro). Una consulta de tipo Tabla trae todas sus filas, y las
        fórmulas usan sus columnas como en Excel: <code>CONTAR.SI(Expedientes[Estado]; 2)</code>. Los nombres con espacios van entre corchetes:
        <code>[Base imponible]</code>. Los cambios se guardan al salir del campo o con Enter, y se recalcula lo que depende de ellos.
        Se guardan en este navegador.
      </p>
      <Message v-if="mensaje" :severity="mensaje.variante" class="mt-3">{{ mensaje.texto }}</Message>
    </section>

    <section v-if="visibles.length > 0" class="panel">
      <div class="table-responsive">
        <table ref="tabla" class="tabla tabla-variables">
          <thead>
            <tr>
              <th scope="col" :aria-sort="ariaOrden('nombre')">
                <button type="button" class="ordenar" title="Ordenar por nombre" @click="ordenarPor('nombre')">Nombre {{ flecha('nombre') }}</button>
              </th>
              <th scope="col">Descripción</th>
              <th scope="col" :aria-sort="ariaOrden('tipo')">
                <button type="button" class="ordenar" title="Ordenar por tipo" @click="ordenarPor('tipo')">Tipo {{ flecha('tipo') }}</button>
              </th>
              <th scope="col">Clase</th>
              <th scope="col">Valor o fórmula</th>
              <th scope="col">Resultado</th>
              <th scope="col">Estado</th>
              <th scope="col"><span class="visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <!-- Por posición: al renombrar cambia el nombre, y la fila no tiene que perder el foco. -->
            <FilaVariable v-for="f in visibles" :key="f.indice" :variable="f.variable" :estado="f.estado" :recalculada="f.recalculada" />
          </tbody>
          <tfoot>
            <tr>
              <td colspan="8" class="texto-atenuado text-end small" data-prueba="total">
                <template v-if="visibles.length < filas.length">{{ visibles.length }} de </template>{{ filas.length }} {{ filas.length === 1 ? 'variable' : 'variables' }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section v-else-if="filas.length > 0" class="panel">
      <Vacio icono="pi-search-minus" titulo="Ninguna coincide" :subtitulo="`No hay variables con «${busqueda.trim()}».`" />
    </section>

    <section v-else class="panel">
      <Vacio icono="pi-table" titulo="Sin variables" subtitulo="Agregá una o importá un JSON." />
    </section>
  </div>
</template>

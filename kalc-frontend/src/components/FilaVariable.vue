<script setup lang="ts">
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import { computed, ref, watch } from 'vue'
import { definirVariable, quitarVariable, recalcularVariable } from '../catalogo.ts'
import { conexiones } from '../conexiones.ts'
import { TIPOS } from '../tipos.ts'
import VistaTabla from './VistaTabla.vue'
import { escribirDatos, formatear, leerConstante, leerDatos, validarNombre, type ColumnaCalculada, type EstadoVariable, type TipoVariable, type Variable } from 'kalc'

/**
 * Una variable en la tabla, editable en el lugar. Lo escrito queda como borrador hasta que el
 * campo pierde el foco o se aprieta Enter (`change`): ahí se valida y, si sirve, se guarda y se
 * recalcula. Si no sirve, el aviso queda en la fila y no se guarda nada.
 */
const props = defineProps<{ variable: Variable; estado: EstadoVariable | undefined; recalculada: boolean }>()

type Clase = Variable['origen']['clase']

/** Una tabla no es una constante: sale de una fórmula, una consulta o datos escritos a mano. */
const CLASES: { id: Clase; titulo: string; tabla: boolean | null }[] = [
  { id: 'constante', titulo: 'Constante', tabla: false },
  { id: 'formula', titulo: 'Fórmula', tabla: null },
  { id: 'consulta', titulo: 'Consulta', tabla: null },
  { id: 'datos', titulo: 'Datos', tabla: true },
]

const PLACEHOLDER: Record<TipoVariable, string> = {
  numero: '1234,56',
  entero: '12',
  texto: 'texto',
  logico: 'VERDADERO',
  fecha: 'dd/mm/aaaa',
  tabla: '',
}

const nombre = ref('')
const descripcion = ref('')
const tipo = ref<TipoVariable>('numero')
const clase = ref<Clase>('constante')
/** El valor de la constante escrito, el texto de la fórmula, el SQL o la tabla escrita. */
const contenido = ref('')
/** En qué base corre la consulta; '' es la de por defecto del servidor. */
const conexion = ref('')
/** Las columnas calculadas de una tabla, como se están escribiendo. */
const columnas = ref<ColumnaCalculada[]>([])
/** Por qué no se guardó lo escrito. */
const aviso = ref<string | null>(null)

const clases = computed(() => CLASES.filter((c) => c.tabla === null || c.tabla === (tipo.value === 'tabla')))

/** Las del servidor y, si el servidor no la tiene (vino de otro), la de la variable: para que se vea. */
const opcionesConexion = computed(() => {
  const delServidor = conexiones.value?.conexiones ?? []
  return conexion.value && !delServidor.includes(conexion.value) ? [...delServidor, conexion.value] : delServidor
})
/** Con una sola base no hay nada que elegir. */
const mostrarConexion = computed(() => clase.value === 'consulta' && (opcionesConexion.value.length > 1 || conexion.value !== ''))

function contenidoDe({ origen }: Variable): string {
  switch (origen.clase) {
    case 'formula':
      return origen.texto
    case 'consulta':
      return origen.sql
    case 'datos':
      return escribirDatos(origen.tabla)
    case 'constante':
      return formatear(origen.valor)
  }
}

/** Cuando la variable cambia desde afuera (un renombre corrigió su fórmula), se descarta el borrador. */
watch(
  () => props.variable,
  (v) => {
    nombre.value = v.nombre
    descripcion.value = v.descripcion ?? ''
    tipo.value = v.tipo
    clase.value = v.origen.clase
    contenido.value = contenidoDe(v)
    conexion.value = v.origen.clase === 'consulta' ? (v.origen.conexion ?? '') : ''
    columnas.value = (v.columnas ?? []).map((c) => ({ ...c }))
    aviso.value = null
  },
  { immediate: true },
)

const problema = computed(() => props.estado?.problema)

/** La fórmula partida para marcar el error de sintaxis. */
const tramos = computed(() => {
  const p = problema.value
  if (p?.clase !== 'sintaxis' || props.variable.origen.clase !== 'formula') return null
  const f = props.variable.origen.texto
  return { antes: f.slice(0, p.inicio), marcado: f.slice(p.inicio, p.fin) || ' ', despues: f.slice(p.fin) }
})

/** Al pasar a tabla, una constante pasa a Datos; al dejar de serlo, Datos pasa a Constante. */
function cambiarTipo() {
  if (tipo.value === 'tabla' && clase.value === 'constante') clase.value = 'datos'
  else if (tipo.value !== 'tabla' && clase.value === 'datos') clase.value = 'constante'
  else return void confirmar()
  contenido.value = ''
  void confirmar()
}

function agregarColumna() {
  columnas.value.push({ nombre: '', formula: '' })
}

function quitarColumna(i: number) {
  columnas.value.splice(i, 1)
  void confirmar()
}

async function confirmar() {
  aviso.value = null
  const n = nombre.value.trim()
  const motivo = validarNombre(n)
  if (motivo) {
    aviso.value = motivo
    return
  }
  let origen: Variable['origen']
  if (clase.value === 'constante') {
    const r = leerConstante(contenido.value, tipo.value)
    if (!r.ok) {
      aviso.value = r.mensaje
      return
    }
    origen = { clase: 'constante', valor: r.valor }
  } else if (clase.value === 'datos') {
    const r = leerDatos(contenido.value)
    if (!r.ok) {
      aviso.value = r.mensaje
      return
    }
    origen = { clase: 'datos', tabla: r.tabla }
  } else if (clase.value === 'consulta') {
    origen = { clase: 'consulta', sql: contenido.value, ...(conexion.value ? { conexion: conexion.value } : {}) }
  } else {
    origen = { clase: 'formula', texto: contenido.value }
  }
  // Una columna recién agregada, todavía sin nombre ni fórmula, no se guarda.
  const calculadas = tipo.value === 'tabla' ? columnas.value.map((c) => ({ nombre: c.nombre.trim(), formula: c.formula })).filter((c) => c.nombre || c.formula.trim()) : []
  const d = descripcion.value.trim()
  const variable: Variable = { nombre: n, tipo: tipo.value, origen, ...(calculadas.length ? { columnas: calculadas } : {}), ...(d ? { descripcion: d } : {}) }
  if (JSON.stringify(variable) === JSON.stringify(props.variable)) return
  try {
    await definirVariable(variable, props.variable.nombre)
  } catch (e) {
    aviso.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <tr :class="{ 'fila-recalculada': recalculada }" :data-variable="variable.nombre">
    <td>
      <InputText v-model="nombre" type="text" size="small" fluid class="celda-nombre" aria-label="Nombre" spellcheck="false" @change="confirmar" />
    </td>
    <td>
      <InputText v-model="descripcion" type="text" size="small" fluid class="celda-descripcion" aria-label="Descripción" placeholder="Descripción" @change="confirmar" />
    </td>
    <td>
      <select v-model="tipo" class="campo-select" aria-label="Tipo" @change="cambiarTipo">
        <option v-for="t in TIPOS" :key="t.id" :value="t.id">{{ t.titulo }}</option>
      </select>
    </td>
    <td>
      <select v-model="clase" class="campo-select" aria-label="Clase" @change="confirmar">
        <option v-for="c in clases" :key="c.id" :value="c.id">{{ c.titulo }}</option>
      </select>
    </td>
    <td>
      <select
        v-if="mostrarConexion"
        v-model="conexion"
        class="campo-select mb-1"
        aria-label="Conexión"
        title="En qué base corre la consulta"
        @change="confirmar"
      >
        <option value="">{{ conexiones?.porDefecto ? `Por defecto (${conexiones.porDefecto})` : 'Por defecto' }}</option>
        <option v-for="c in opcionesConexion" :key="c" :value="c">{{ conexiones?.conexiones.includes(c) ? c : `${c} (no está en el servidor)` }}</option>
      </select>
      <!-- El SQL y los datos van en varias líneas: un input les sacaría los saltos. -->
      <Textarea
        v-if="clase === 'consulta' || clase === 'datos'"
        v-model="contenido"
        size="small"
        fluid
        class="celda-contenido font-monospace"
        :invalid="!!aviso"
        :rows="Math.max(2, contenido.split('\n').length)"
        :aria-label="clase === 'consulta' ? 'Consulta' : 'Datos'"
        :placeholder="
          clase === 'datos'
            ? 'Tipo;Alicuota\nGeneral;0,21\nReducida;0,105'
            : tipo === 'tabla'
              ? 'select id, estado from expedientes'
              : 'select descripcion from fueros where codigo = :Fuero'
        "
        :title="clase === 'datos' ? 'La primera línea, los nombres de las columnas; separados con ; o pegados desde Excel' : undefined"
        spellcheck="false"
        @change="confirmar"
      />
      <InputText
        v-else
        v-model="contenido"
        type="text"
        size="small"
        fluid
        class="celda-contenido"
        :invalid="!!aviso || problema?.clase === 'sintaxis'"
        :aria-label="clase === 'formula' ? 'Fórmula' : 'Valor'"
        :placeholder="clase === 'formula' ? (tipo === 'tabla' ? 'FILTRAR(Expedientes; Expedientes[Estado] = 2)' : 'Neto * Alicuota') : PLACEHOLDER[tipo]"
        spellcheck="false"
        @change="confirmar"
      />
      <!-- Columnas calculadas: una fórmula por fila, con [@Columna]. -->
      <div v-if="tipo === 'tabla'" class="columnas-calculadas" data-prueba="columnas">
        <div v-for="(c, i) in columnas" :key="i" class="columna-calculada">
          <InputText v-model="c.nombre" type="text" size="small" aria-label="Nombre de la columna" placeholder="Columna" spellcheck="false" @change="confirmar" />
          <InputText v-model="c.formula" type="text" size="small" aria-label="Fórmula de la columna" placeholder="[@Monto] * 2" spellcheck="false" @change="confirmar" />
          <Button icon="pi pi-times" text size="small" severity="danger" :title="`Quitar la columna ${c.nombre}`" :aria-label="`Quitar la columna ${c.nombre}`" @click="quitarColumna(i)" />
        </div>
        <Button icon="pi pi-plus" label="Columna calculada" text size="small" class="agregar-columna" title="Una columna con una fórmula por fila: [@Alta] es la celda de esa fila" @click="agregarColumna" />
      </div>
    </td>
    <td class="celda-resultado" :class="{ 'text-danger': estado?.valor.tipo === 'error' && !estado.tabla }" data-prueba="resultado">
      <VistaTabla v-if="estado?.tabla" :tabla="estado.tabla" />
      <template v-else>{{ estado ? formatear(estado.valor) : '' }}</template>
    </td>
    <td class="celda-estado small" data-prueba="estado">
      <div v-if="aviso" class="text-danger">No se guardó: {{ aviso }}</div>
      <template v-if="problema?.clase === 'sintaxis'">
        <div class="text-danger">{{ problema.mensaje }}</div>
        <div v-if="tramos" class="formula-marcada formula-marcada-error p-0 m-0">{{ tramos.antes }}<mark>{{ tramos.marcado }}</mark>{{ tramos.despues }}</div>
      </template>
      <div v-else-if="problema?.clase === 'ciclo'" class="text-danger">Ciclo: {{ problema.camino.join(' → ') }}</div>
      <div v-else-if="problema?.clase === 'faltan'" class="text-danger">
        No existe{{ problema.nombres.length > 1 ? 'n' : '' }}: {{ problema.nombres.join(', ') }}
      </div>
      <div v-else-if="problema?.clase === 'tipo'" class="text-warning-emphasis">{{ problema.mensaje }}</div>
      <div v-else-if="problema?.clase === 'pendiente'" class="text-secondary">Esperando la consulta a la base</div>
      <div v-else-if="problema?.clase === 'consulta'" class="text-danger">{{ problema.mensaje }}</div>
      <div v-else-if="problema?.clase === 'columna'" class="text-danger">Columna {{ problema.columna || '(sin nombre)' }}: {{ problema.mensaje }}</div>
      <span v-else-if="!aviso" class="text-success" title="Sin problemas"><i class="pi pi-check" aria-hidden="true"></i> OK</span>
    </td>
    <td class="text-end text-nowrap">
      <Button
        icon="pi pi-refresh"
        text
        size="small"
        :title="variable.origen.clase === 'consulta' ? `Volver a correr la consulta de ${variable.nombre}` : `Recalcular ${variable.nombre}`"
        :aria-label="`Recalcular ${variable.nombre}`"
        @click="recalcularVariable(variable.nombre)"
      />
      <Button icon="pi pi-trash" text size="small" severity="danger" :title="`Quitar ${variable.nombre}`" :aria-label="`Quitar ${variable.nombre}`" @click="quitarVariable(variable.nombre)" />
    </td>
  </tr>
</template>

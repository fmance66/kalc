<script setup lang="ts">
import type { Variable } from 'kalc'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { computed, ref } from 'vue'
import { agregarFaltantes, catalogo } from '../catalogo.ts'
import { conexiones } from '../conexiones.ts'
import EnlaceRepositorio from '../components/EnlaceRepositorio.vue'
import { VARIABLES_INICIALES } from '../pruebas/variablesIniciales.ts'
import { CONEXION_POSTGRES, VARIABLES_POSTGRES } from '../pruebas/variablesPostgres.ts'

const emit = defineEmits<{ probar: [formula: string] }>()

/** De mayor a menor precedencia, como Excel. */
const OPERADORES: { operador: string; que: string; ejemplo: string; resultado: string }[] = [
  { operador: '-', que: 'Negativo (unario). Va antes que ^', ejemplo: '-2^2', resultado: '4' },
  { operador: '%', que: 'Porcentaje (sufijo): divide por 100', ejemplo: '50%*200', resultado: '100' },
  { operador: '^', que: 'Potencia. Se agrupa de izquierda a derecha', ejemplo: '2^3^2', resultado: '64' },
  { operador: '* /', que: 'Multiplicación y división', ejemplo: '1+2*3', resultado: '7' },
  { operador: '+ -', que: 'Suma y resta', ejemplo: '"3"+1', resultado: '4' },
  { operador: '&', que: 'Concatena textos', ejemplo: '"Total: "&1234,5', resultado: 'Total: 1234,5' },
  { operador: '= <> < > <= >=', que: 'Comparación: da VERDADERO o FALSO', ejemplo: '"a"="A"', resultado: 'VERDADERO' },
]

const ERRORES: { codigo: string; cuando: string; ejemplo?: string }[] = [
  { codigo: '#¡DIV/0!', cuando: 'División por cero.', ejemplo: '1/0' },
  { codigo: '#¡VALOR!', cuando: 'Un valor del tipo equivocado: un texto que no es número en una cuenta.', ejemplo: '"abc"+1' },
  { codigo: '#¿NOMBRE?', cuando: 'Una función o una variable que no existe.', ejemplo: 'NOEXISTE(1)' },
  { codigo: '#¡NUM!', cuando: 'Un número fuera de rango para la función.', ejemplo: 'FECHA(10000; 1; 1)' },
  { codigo: '#N/D', cuando: 'Valor no disponible. Se puede escribir para marcar un dato que falta.', ejemplo: '#N/D' },
  { codigo: '#¡REF!', cuando: 'Referencia inválida.' },
  { codigo: '#¡CICLO!', cuando: 'La variable depende de sí misma (A usa B y B usa A). No existe en Excel: ver más abajo.' },
]

const CASOS_RAROS = ['-2^2', '2^3^2', '"1">99999', '0,1+0,2=0,3', 'REDONDEAR(-2,5; 0)', 'SI(VERDADERO; 1; 1/0)', 'Y(FALSO; 1/0)', 'FECHA(1900; 2; 29)']

/** Con las tablas del juzgado de ejemplo de las variables iniciales. */
const CASOS_TABLAS = [
  'CONTAR.SI(Expedientes[Estado]; 2)',
  'MAX(Expedientes[Alta])',
  'BUSCARV(2; Estados; 2; FALSO)',
  'Expedientes[Nada]',
]

/** Con Causas, la tabla de ejemplo: andan siempre, sin la base. */
const CASOS_ARRAYS = [
  'Causas[Monto] / 1000',
  'SUMA((Causas[Fuero] = "Federal") * Causas[Monto])',
  'FILTRAR(Causas; Causas[Monto] > 500000)',
  'TOMAR(ORDENAR(Causas; 3; -1); 2)',
  'UNICOS(Causas[Fuero])',
  'ELEGIRCOLS(Causas; 1; 3)',
  'FILTRAR(Causas; ESNUMERO(HALLAR("ez"; Causas[Causa])))',
  'FILTRAR(Causas; CONTIENE(Causas[Causa]; "ez"))',
  'MAYUSC(Causas[Fuero])',
]

/**
 * Consultas al juzgado de ejemplo (esquema juzgado de la base PostgreSQL de kalc-backend), probadas
 * contra la base. El SQL y el tipo salen de las variables iniciales: así lo que se muestra es lo
 * que se carga. `hoy` es lo que devuelven con los datos de db/postgres/juzgado.sql.
 */
const EJEMPLOS_JUZGADO = [
  { variable: 'Nombre del fuero', que: 'Un valor, con un parámetro: :Fuero es otra variable (vale 1).', hoy: 'Federal', formulas: ['"Fuero " & [Nombre del fuero]'] },
  { variable: 'Expedientes vigentes', que: 'Un valor calculado en la base, con count(*).', hoy: '367', formulas: ['SI([Expedientes vigentes] > 300; "Muchos"; "Pocos")'] },
  {
    variable: 'Expedientes',
    que: 'Tabla: todas las filas, con cuatro columnas (ID, ESTADO, REGION, ALTA).',
    hoy: '367 filas',
    formulas: ['CONTAR.SI(Expedientes[Estado]; 2)', 'MAX(Expedientes[Alta])', 'BUSCARV(1; Expedientes; 3; FALSO)'],
  },
  { variable: 'Estados', que: 'Tabla de códigos y nombres, para buscar con BUSCARV.', hoy: '3 filas', formulas: ['BUSCARV(2; Estados; 2; FALSO)'] },
  { variable: 'Jurisdicciones', que: 'Tabla con parámetro: se vuelve a correr sola si cambia Fuero.', hoy: '9 filas', formulas: ['FILAS(Jurisdicciones)', 'INDICE(Jurisdicciones[Descripcion]; 1)'] },
  {
    variable: 'Expedientes por estado',
    que: 'Tabla agrupada en el SQL (group by): conviene agrupar en la base y traer pocas filas.',
    hoy: '3 filas',
    formulas: ['BUSCARV(2; [Expedientes por estado]; 2; FALSO)', 'SUMA([Expedientes por estado][Cantidad])'],
  },
  { variable: 'Expedientes por región', que: 'Tabla con join y orden: la primera fila es la región con más expedientes.', hoy: '6 filas', formulas: ['INDICE([Expedientes por región][Region]; 1)'] },
  { variable: 'Expedientes con estado', que: 'Tabla con join: el nombre del estado en vez del código.', hoy: '367 filas', formulas: ['CONTAR.SI([Expedientes con estado][Estado]; "En tr*")'] },
].map((e) => conSql(e, VARIABLES_INICIALES))

/**
 * Consultas a la base PostgreSQL de prueba (conexión `local` de kalc-backend, solo en desarrollo).
 * Los datos son fijos: dan siempre lo mismo, salvo las que dependen de la fecha de hoy.
 */
const EJEMPLOS_POSTGRES = [
  { variable: 'Alícuota IIBB', que: 'Un valor, con un parámetro de texto: :Actividad (vale 620100).', hoy: '0,035', formulas: ['Neto * [Alícuota IIBB]'] },
  {
    variable: 'Actividades',
    que: 'Tabla con una columna boolean (exenta): llega como VERDADERO o FALSO.',
    hoy: '20 filas',
    formulas: ['CONTAR.SI(Actividades[Exenta]; VERDADERO)', 'BUSCARV("620100"; Actividades; 4; FALSO)'],
  },
  { variable: 'Escala', que: 'Tramos: BUSCARV aproximado (VERDADERO) encuentra el tramo de un importe.', hoy: '9 filas', formulas: ['[Impuesto según escala]', 'BUSCARV([Base imponible]; Escala; 4; VERDADERO)'] },
  { variable: 'Cotización', que: 'Dos parámetros (:Moneda y :Día) y una subconsulta: si el día no es hábil, da la del anterior.', hoy: '1779,01', formulas: ['REDONDEAR(Total / Cotización; 2)'] },
  { variable: 'Cotizaciones del dólar', que: 'Tabla con fechas: una fila por día hábil de 2026.', hoy: '194 filas', formulas: ['MAX([Cotizaciones del dólar][Vendedor])', 'MIN([Cotizaciones del dólar][Fecha])'] },
  { variable: 'Ventas por sucursal', que: 'Tabla con join, agrupada en la base: 2000 ventas en 6 filas.', hoy: '6 filas', formulas: ['INDICE([Ventas por sucursal][Sucursal]; 1)', 'SUMA([Ventas por sucursal][Ventas])'] },
  { variable: 'Feriados', que: 'Tabla de fechas: FILTRAR y HOY dan el próximo.', hoy: '16 filas', formulas: ['MIN(FILTRAR(Feriados[Fecha]; Feriados[Fecha] >= HOY()))', 'CONTAR.SI(Feriados[Inamovible]; FALSO)'] },
  { variable: 'Nombre del empleado', que: 'Esquema hr (el de ejemplo de Oracle): un parámetro numérico, :Empleado (vale 104).', hoy: 'Bruce Ernst', formulas: ['"Hola, " & [Nombre del empleado]'] },
  { variable: 'Empleados', que: 'Los 107 empleados de hr, con alias en castellano para las columnas.', hoy: '107 filas', formulas: ['PROMEDIO.SI(Empleados[Departamento]; 60; Empleados[Sueldo])', 'MIN(Empleados[Alta])'] },
  { variable: 'Empleados por departamento', que: 'Agrupada sobre la vista emp_details_view.', hoy: '11 filas', formulas: ['BUSCARV("IT"; [Empleados por departamento]; 3; FALSO)'] },
  { variable: 'Antigüedad promedio', que: 'Convierte con :: de PostgreSQL (no es un parámetro).', hoy: '20,9', formulas: ['ENTERO([Antigüedad promedio])'] },
  { variable: 'Grados salariales', que: 'Esquema scott (SCOTT/TIGER): la tabla salgrade, por tramos de sueldo.', hoy: '5 filas', formulas: ['BUSCARV(1250; [Grados salariales]; 3; VERDADERO)'] },
].map((e) => conSql(e, VARIABLES_POSTGRES))

/** El ejemplo con el SQL y el tipo de su variable: así lo que se muestra es lo que se carga. */
function conSql<T extends { variable: string }>(e: T, variables: readonly Variable[]) {
  const v = variables.find((x) => x.nombre === e.variable)
  return { ...e, tabla: v?.tipo === 'tabla', sql: v?.origen.clase === 'consulta' ? v.origen.sql : '' }
}

/** Los ejemplos de PostgreSQL se muestran solo si kalc-backend tiene la conexión `local`. */
const hayPostgres = computed(() => conexiones.value?.conexiones.includes(CONEXION_POSTGRES) ?? false)
// catalogo cambia con triggerRef al definir o quitar: así se entera de las que se agregan.
const faltan = computed(() => VARIABLES_POSTGRES.filter((v) => !catalogo.value.buscar(v.nombre)))
const agregando = ref(false)
const repositorio = import.meta.env.VITE_REPOSITORIO

/** Agrega las que faltan: las que ya están (aunque se hayan cambiado) no se tocan. */
async function agregarPostgres() {
  agregando.value = true
  try {
    await agregarFaltantes(VARIABLES_POSTGRES)
  } finally {
    agregando.value = false
  }
}
</script>

<template>
  <div class="ayuda">
    <section class="panel">
      <h2 class="panel-titulo">Cómo se escribe una fórmula</h2>
      <p>
        Como en Excel con la configuración en castellano: los argumentos se separan con <code>;</code> y los decimales con
        <code>,</code>. No hace falta el <code>=</code> inicial (si se pega una fórmula de Excel que lo tiene, se acepta igual).
      </p>
      <ul class="mb-0">
        <li><strong>Números</strong>: <code>1234,5</code>, <code>1,5E+3</code>, <code>21%</code>.</li>
        <li><strong>Textos</strong>: entre comillas dobles; una comilla adentro se escribe doble: <code>"dijo ""hola"""</code>.</li>
        <li><strong>Lógicos</strong>: <code>VERDADERO</code> y <code>FALSO</code>.</li>
        <li><strong>Errores</strong>: se pueden escribir tal cual, por ejemplo <code>#N/D</code>.</li>
        <li>
          <strong>Funciones</strong>: con el nombre en castellano o en inglés (<code>SI</code> o <code>IF</code>), sin distinguir
          mayúsculas. Están todas en la solapa Funciones.
        </li>
        <li>
          <strong>Variables</strong>: por su nombre (<code>Neto * Alicuota</code>), sin distinguir mayúsculas. Si el nombre tiene
          espacios, entre corchetes: <code>[Días al vencimiento]</code>.
        </li>
        <li>
          <strong>Con o sin corchetes</strong>: <code>Neto</code> y <code>[Neto]</code> son lo mismo. Los corchetes se pueden
          poner siempre, pero solo hacen falta si el nombre tiene espacios u otros signos (<code>[Base imponible]</code>).
        </li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">El Probador</h2>
      <ul class="mb-0">
        <li>
          Se calcula con <kbd>Enter</kbd> o con Calcular. Si después se cambia la fórmula, el resultado queda atenuado hasta
          volver a calcular.
        </li>
        <li>
          <strong>Elegir una variable</strong>: al escribir <code>[</code> se despliegan las variables, filtradas por lo que se
          escribe (sin mayúsculas ni tildes: <code>alic</code> encuentra Alícuota), y se insertan entre corchetes
          (<code>[Neto]</code>). Con <kbd>Ctrl</kbd>+<kbd>Espacio</kbd> no hace falta el corchete: se ofrecen para el nombre a
          medio escribir y se insertan con corchetes solo si los necesitan (<code>Neto</code>, <code>[Base imponible]</code>).
        </li>
        <li>
          <strong>Elegir una columna</strong>: con el <code>[</code> pegado a una tabla (<code>Causas[</code>), se despliegan sus
          columnas.
        </li>
        <li>
          En la lista: <kbd>↑</kbd> <kbd>↓</kbd> para moverse, <kbd>Enter</kbd> o <kbd>Tab</kbd> (o un clic) para elegir,
          <kbd>Escape</kbd> para cerrarla.
        </li>
        <li>
          <strong>Probar</strong>: las últimas 20 fórmulas calculadas, guardadas en este navegador; un clic y se vuelven a
          calcular. Sin historial (o después de Borrar historial), unos ejemplos.
        </li>
        <li>
          El <strong>árbol de la fórmula</strong> muestra cómo se lee: cada renglón es una parte, con lo que vale, y al pasar el
          mouse se marca en la fórmula.
        </li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Operadores</h2>
      <p class="texto-atenuado small">De mayor a menor precedencia: los de arriba se calculan primero. Los paréntesis cambian el orden.</p>
      <div class="table-responsive">
        <table class="tabla tabla-ayuda">
          <thead>
            <tr>
              <th scope="col">Operador</th>
              <th scope="col">Qué hace</th>
              <th scope="col">Ejemplo</th>
              <th scope="col">Resultado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in OPERADORES" :key="o.operador">
              <td><code class="ayuda-operador">{{ o.operador }}</code></td>
              <td class="small">{{ o.que }}</td>
              <td>
                <button type="button" class="ejemplo" title="Abrir en el Probador" @click="emit('probar', o.ejemplo)">{{ o.ejemplo }}</button>
              </td>
              <td><code>{{ o.resultado }}</code></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Tipos de valor</h2>
      <p>Aunque no se vean, Excel tiene tipos, y el resultado depende de ellos:</p>
      <ul class="mb-0">
        <li>
          <strong>Número</strong>. En las cuentas, un texto que parece número se convierte (<code>"3"+1</code> da 4) y
          VERDADERO vale 1; un texto que no es número da <code>#¡VALOR!</code>.
        </li>
        <li><strong>Texto</strong>. Al comparar no se distinguen mayúsculas: <code>"a"="A"</code> es VERDADERO.</li>
        <li><strong>Lógico</strong>. VERDADERO o FALSO.</li>
        <li>
          <strong>Fecha</strong>. Por dentro es el número de serie de Excel (días desde el 30/12/1899), así que opera como
          número: <code>fecha + 1</code> es el día siguiente y la resta de dos fechas da los días entre ellas.
        </li>
        <li><strong>Error</strong>. Se propaga: cualquier cuenta con un error devuelve ese error.</li>
        <li>
          <strong>Vacío</strong>. Una variable sin valor vale 0 en las cuentas y <code>""</code> en los textos, como una celda
          vacía.
        </li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Errores</h2>
      <div class="table-responsive">
        <table class="tabla tabla-ayuda">
          <tbody>
            <tr v-for="e in ERRORES" :key="e.codigo">
              <td><code class="text-danger">{{ e.codigo }}</code></td>
              <td class="small">{{ e.cuando }}</td>
              <td>
                <button v-if="e.ejemplo" type="button" class="ejemplo" title="Abrir en el Probador" @click="emit('probar', e.ejemplo!)">
                  {{ e.ejemplo }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="texto-atenuado small mt-2 mb-0">
        Un error de <em>sintaxis</em> (un paréntesis sin cerrar, un <code>;</code> de más) no da un valor: el Probador subraya
        dónde está.
      </p>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Variables</h2>
      <ul class="mb-0">
        <li>
          Cada una es una <strong>constante</strong> (un valor), una <strong>fórmula</strong> que puede usar otras variables o una
          <strong>consulta</strong> a la base (ver abajo).
        </li>
        <li>Al cambiar una, se recalculan al instante solo las que dependen de ella, y la tabla las resalta.</li>
        <li>
          El <strong>tipo</strong> es el que se espera del resultado. Si no coincide, la fila lo avisa: no se convierte en
          silencio. <code>Entero</code> es un número sin decimales. <code>Tabla</code> es una consulta que trae todas sus filas
          (ver abajo).
        </li>
        <li>Al renombrar una variable se corrigen las fórmulas que la usan.</li>
        <li>
          Si dos o más variables dependen entre sí en círculo, todas valen <code>#¡CICLO!</code> y el estado muestra el camino
          (<code>A → B → A</code>).
        </li>
        <li>No se pueden usar nombres que parezcan celdas (<code>A1</code>, <code>IVA2</code>) ni <code>VERDADERO</code> / <code>FALSO</code>.</li>
        <li>El botón <i class="pi pi-refresh" aria-label="Recalcular"></i> de cada fila recalcula esa variable; Recalcular, todas.</li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Consultas a la base</h2>
      <ul class="mb-0">
        <li>
          Una variable de clase <strong>Consulta</strong> toma su valor de un <code>SELECT</code> que devuelve <strong>una fila con una
          columna</strong>: <code>select count(*) from expedientes where baja is null</code>.
        </li>
        <li>
          <code>:Nombre</code> usa otra variable como <strong>parámetro</strong>:
          <code>select descripcion from fueros where codigo = :Fuero</code>. Si cambia <code>Fuero</code>, la consulta se vuelve a
          correr sola. El valor va aparte, nunca pegado en el SQL. Solo sirven nombres con letras, números y <code>_</code>.
        </li>
        <li>
          Corre en el servidor, contra la base a la que está conectado: Oracle o PostgreSQL, con el mismo <code>:Nombre</code>
          para los parámetros (lo de otros esquemas, con sinónimos o vistas). Solo se acepta una sentencia <code>SELECT</code>
          o <code>WITH</code>, de solo lectura.
        </li>
        <li>
          Si el servidor tiene <strong>varias bases</strong>, la fila muestra <strong>Conexión</strong> para elegir en cuál corre
          (<em>Por defecto</em>, si no se elige). Cambiarla vuelve a correr la consulta. Con una sola base no aparece.
        </li>
        <li>
          Mientras corre vale <code>#N/D</code> y el estado dice que espera. Sin filas da <code>#N/D</code>; con más de una fila o columna,
          o con un error de la base, <code>#¡VALOR!</code> y el motivo en el estado.
        </li>
        <li>
          <code>NUMBER</code> es un número, <code>VARCHAR2</code> un texto, <code>DATE</code> una fecha y <code>NULL</code> una variable
          vacía. En PostgreSQL, lo mismo con <code>integer</code>, <code>numeric</code>, <code>text</code>, <code>date</code> y
          <code>timestamp</code>, y además <code>boolean</code> es VERDADERO o FALSO.
        </li>
        <li>
          Se vuelve a correr si cambian sus parámetros o su SQL; para traer datos nuevos de la base, el botón de la fila o
          Recalcular.
        </li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Tablas</h2>
      <ul class="mb-0">
        <li>
          Una consulta de tipo <strong>Tabla</strong> trae <strong>todas sus filas y columnas</strong>
          (<code>select id, estado, alta from expedientes</code>), hasta 10.000 filas. El resultado
          muestra el tamaño, y con un clic, los datos.
        </li>
        <li>
          Las fórmulas la usan como una tabla de Excel: <code>Expedientes[Estado]</code> es una columna (sin distinguir mayúsculas:
          Oracle devuelve los nombres en mayúscula; PostgreSQL, en minúscula) y <code>Expedientes</code>, la tabla entera. El corchete va pegado al nombre;
          con espacios, <code>[Mis expedientes][Estado]</code>. Por ejemplo, <code>CONTAR.SI(Expedientes[Estado]; 2)</code> cuenta
          los que están en trámite y <code>MAX(Expedientes[Alta])</code> da la fecha del más nuevo.
        </li>
        <li>
          Se usan dentro de funciones: <code>SUMA</code>, <code>PROMEDIO</code>, <code>MIN</code>, <code>MAX</code>,
          <code>CONTAR</code>, <code>CONTAR.SI</code>, <code>SUMAR.SI</code>, <code>BUSCARV</code>, <code>INDICE</code>… (las de
          Estadísticas y Búsqueda en la solapa Funciones). Como en un rango de Excel, el texto de las celdas se ignora al sumar.
        </li>
        <li>
          Una tabla también puede salir de una <strong>fórmula</strong> (abajo) o de <strong>datos escritos a mano</strong>
          (clase Datos). Una columna que no existe da <code>#¡REF!</code>.
        </li>
        <li>
          Los criterios de <code>CONTAR.SI</code> y <code>SUMAR.SI</code> son los de Excel: un valor (<code>"Federal"</code>,
          <code>2</code>), un operador (<code>"&gt;5000"</code>, <code>"&lt;&gt;Baja"</code>) o comodines (<code>"En tr*"</code>,
          <code>"?a*"</code>).
        </li>
        <li>
          Con las variables iniciales cargadas (las tablas <code>Expedientes</code> y <code>Estados</code>), un clic y se
          prueban:
        </li>
      </ul>
      <div class="ejemplos">
        <button v-for="c in CASOS_TABLAS" :key="c" type="button" class="ejemplo" @click="emit('probar', c)">{{ c }}</button>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Arrays, tablas a mano y columnas calculadas</h2>
      <ul class="mb-0">
        <li>
          <strong>Operaciones con tablas</strong>, como en Excel 365: una operación con una tabla o una columna va celda por
          celda. <code>Causas[Monto] / 1000</code> da una columna; <code>Causas[Fuero] = "Federal"</code>, una columna de
          VERDADERO y FALSO. Dentro de una función se usa entera: <code>SUMA((Causas[Fuero] = "Federal") * Causas[Monto])</code>
          suma los montos de las federales (VERDADERO por un número es el número; FALSO, 0). Dos columnas de distinto largo dan
          <code>#N/D</code> en lo que sobra.
        </li>
        <li>
          <strong>Funciones que dan una tabla</strong> (solapa Funciones, Matrices): <code>FILTRAR</code> (las filas que
          cumplen), <code>ORDENAR</code>, <code>UNICOS</code>, <code>ELEGIRCOLS</code> (algunas columnas) y <code>TOMAR</code>
          (las primeras filas). Se pueden anidar: <code>TOMAR(ORDENAR(Causas; 3; -1); 2)</code> son las dos de mayor monto.
        </li>
        <li>
          <strong>Funciones de un valor con una columna</strong>, también como en Excel 365: las de texto (menos
          <code>CONCAT</code>), las de información (<code>ESNUMERO</code>, <code>ESTEXTO</code>…) y <code>AÑO</code>,
          <code>MES</code> y <code>DIA</code> se aplican celda por celda. <code>MAYUSC(Causas[Fuero])</code> da una columna.
          Así se escribe <strong>"contiene"</strong>: <code>HALLAR</code> da la posición de un texto dentro de otro (sin
          distinguir mayúsculas, con comodines) o <code>#¡VALOR!</code> si no está, y <code>ESNUMERO</code> lo vuelve VERDADERO o
          FALSO: <code>FILTRAR(Causas; ESNUMERO(HALLAR("ez"; Causas[Causa])))</code> son las causas cuyo nombre contiene "ez".
          Más corto, con <code>CONTIENE</code>, una función propia de Kalc:
          <code>FILTRAR(Causas; CONTIENE(Causas[Causa]; "ez"))</code>. Para distinguir mayúsculas, <code>ENCONTRAR</code>.
        </li>
        <li>
          Una fórmula que da una tabla va en una variable de tipo <strong>Tabla</strong>, clase Fórmula
          (<code>FILTRAR(Expedientes; Expedientes[Estado] = 2)</code>), y se usa como cualquier tabla. En una variable de un
          valor da <code>#¡VALOR!</code> y el estado lo explica. En el Probador se ve la tabla entera.
        </li>
        <li>
          <strong>Tablas a mano</strong>: tipo Tabla, clase <strong>Datos</strong>. La primera línea son los nombres de las
          columnas y cada una de las siguientes, una fila; las celdas se separan con <code>;</code>, o se pegan directo desde
          Excel. Cada celda se lee como una constante (<code>0,21</code>, <code>31/12/2026</code>, <code>VERDADERO</code>), y
          entre comillas es un texto (<code>"100"</code>). Sirven para alícuotas, topes o escalas que no están en la base.
        </li>
        <li>
          <strong>Columnas calculadas</strong>: a cualquier tabla se le agregan columnas con una fórmula que se calcula fila por
          fila (botón <em>Columna calculada</em> en Variables). <code>[@Alta]</code> es la celda de esa fila en la columna Alta
          (también <code>Expedientes[@Alta]</code>, y <code>[@[Fecha de alta]]</code> si tiene espacios); puede usar las
          columnas calculadas anteriores, otras variables y la misma tabla entera:
          <code>[@Monto] / SUMA(Causas[Monto])</code> es la parte de cada una. Fuera de una columna calculada,
          <code>[@Alta]</code> da <code>#¡VALOR!</code>.
        </li>
        <li>Con <code>Causas</code>, la tabla de ejemplo, un clic y se prueban:</li>
      </ul>
      <div class="ejemplos">
        <button v-for="c in CASOS_ARRAYS" :key="c" type="button" class="ejemplo" @click="emit('probar', c)">{{ c }}</button>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Ejemplos con el juzgado</h2>
      <p>
        Consultas a un juzgado de ejemplo, con datos inventados: el esquema <code>juzgado</code> de la base PostgreSQL de
        kalc-backend (<code>db/postgres/juzgado.sql</code>). Están en las variables iniciales: las fórmulas de cada una se abren
        en el Probador con un clic. Para armar otra, en Variables: Agregar, clase Consulta, tipo <strong>Tabla</strong> si trae
        varias filas (si no, el tipo del valor), y el SQL.
      </p>
      <div v-for="e in EJEMPLOS_JUZGADO" :key="e.variable" class="ayuda-ejemplo-sql" :data-ejemplo="e.variable">
        <div class="ayuda-ejemplo-titulo">
          <strong>{{ e.variable }}</strong>
          <Tag :value="e.tabla ? 'Tabla' : 'Un valor'" severity="secondary" />
          <span class="texto-atenuado small">hoy: {{ e.hoy }}</span>
        </div>
        <div class="small">{{ e.que }}</div>
        <pre class="ayuda-sql">{{ e.sql }}</pre>
        <div class="ejemplos mt-0">
          <span class="texto-atenuado">Probar:</span>
          <button v-for="f in e.formulas" :key="f" type="button" class="ejemplo" @click="emit('probar', f)">{{ f }}</button>
        </div>
      </div>
    </section>

    <section v-if="hayPostgres" class="panel" data-seccion="postgres">
      <h2 class="panel-titulo">Ejemplos con PostgreSQL</h2>
      <p>
        Consultas a la base PostgreSQL de prueba de kalc-backend (conexión <code>{{ CONEXION_POSTGRES }}</code>, solo en
        desarrollo): los esquemas <code>hr</code> y <code>scott</code>, los de ejemplo de Oracle, y <code>prueba</code>. El SQL
        se escribe igual que para Oracle, con <code>:Nombre</code>; las columnas llegan en minúscula.
        <template v-if="faltan.length">
          Faltan {{ faltan.length }} de sus {{ VARIABLES_POSTGRES.length }} variables en Variables:
          <Button label="Agregarlas" size="small" outlined class="agregar-postgres" :disabled="agregando" @click="agregarPostgres" />
        </template>
        <template v-else>Sus variables ya están en Variables: las fórmulas se abren en el Probador con un clic.</template>
      </p>
      <div v-for="e in EJEMPLOS_POSTGRES" :key="e.variable" class="ayuda-ejemplo-sql" :data-ejemplo="e.variable">
        <div class="ayuda-ejemplo-titulo">
          <strong>{{ e.variable }}</strong>
          <Tag :value="e.tabla ? 'Tabla' : 'Un valor'" severity="secondary" />
          <span class="texto-atenuado small">da: {{ e.hoy }}</span>
        </div>
        <div class="small">{{ e.que }}</div>
        <pre class="ayuda-sql">{{ e.sql }}</pre>
        <div class="ejemplos mt-0">
          <span class="texto-atenuado">Probar:</span>
          <button v-for="f in e.formulas" :key="f" type="button" class="ejemplo" @click="emit('probar', f)">{{ f }}</button>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Reglas de Excel que sorprenden</h2>
      <p>Se respetan para dar el mismo resultado que Excel. Un clic y se prueban:</p>
      <div class="ejemplos mt-0">
        <button v-for="c in CASOS_RAROS" :key="c" type="button" class="ejemplo" @click="emit('probar', c)">{{ c }}</button>
      </div>
      <ul class="mt-3 mb-0">
        <li><code>-2^2</code> da 4: el menos va antes que la potencia. Y <code>2^3^2</code> es <code>(2^3)^2</code> = 64.</li>
        <li>Entre tipos distintos no se convierte al comparar: número &lt; texto &lt; lógico, así que <code>"1">99999</code> es VERDADERO.</li>
        <li>Se compara y se muestra con 15 dígitos significativos: <code>0,1+0,2=0,3</code> es VERDADERO.</li>
        <li><code>REDONDEAR</code> lleva el 5 hacia afuera: <code>REDONDEAR(-2,5; 0)</code> da -3.</li>
        <li>
          <code>SI</code>, <code>SI.ERROR</code>, <code>SI.CONJUNTO</code> y <code>CAMBIAR</code> solo calculan la rama que
          usan; <code>Y</code> y <code>O</code> calculan todo, así que <code>Y(FALSO; 1/0)</code> da <code>#¡DIV/0!</code>.
        </li>
        <li><code>SI</code> con la condición falsa y sin valor para ese caso devuelve FALSO.</li>
        <li>
          Una variable sola como argumento se trata como una celda: en <code>SUMA</code>, <code>PROMEDIO</code>,
          <code>MIN</code>, <code>MAX</code>, <code>Y</code> y <code>O</code> se ignora si tiene un texto, mientras que
          <code>SUMA("3")</code> sí suma 3.
        </li>
        <li>Existe el 29/02/1900, como en Excel (un error heredado de Lotus 1-2-3), para que los números de serie coincidan.</li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="panel-titulo">Diferencias con Excel</h2>
      <ul class="mb-0">
        <li>
          No hay celdas ni rangos (<code>A1</code>, <code>SUMA(A1:A10)</code>): solo variables con nombre y tablas (de una
          consulta, una fórmula o datos a mano). De las referencias de tabla de Excel están la columna, la tabla entera y
          <code>[@Columna]</code> (en columnas calculadas); no <code>[#Totales]</code> ni rangos de columnas.
        </li>
        <li>
          De las funciones de un valor, se aplican celda por celda a una columna las de texto, las de información y
          <code>AÑO</code>, <code>MES</code> y <code>DIA</code>; las demás (<code>SI</code>, <code>REDONDEAR</code>,
          <code>ABS</code>…) todavía no, como sí hace Excel 365: para eso, una columna calculada. <code>FILTRAR</code>,
          <code>UNICOS</code> y <code>TOMAR</code> sin resultado dan <code>#N/D</code> (Excel da <code>#¡CALC!</code>).
        </li>
        <li>
          Se calcula con números de doble precisión, como Excel, para dar sus mismos resultados: no hay decimal exacto. Para los
          importes, <code>REDONDEAR</code>.
        </li>
        <li>Una referencia circular no se resuelve con iteraciones: las variables del ciclo valen <code>#¡CICLO!</code>, un error que Excel no tiene.</li>
        <li>
          Las fechas son un tipo propio: se ven como fecha sin tener que darles formato. Al concatenarlas con
          <code>&amp;</code> aparece el número de serie, igual que en Excel; para mostrarlas, <code>TEXTO(fecha; "dd/mm/aaaa")</code>.
        </li>
        <li>Los números se muestran en formato General, sin separador de miles; para darles formato, <code>TEXTO</code>.</li>
        <li>
          <code>HOY</code> se calcula al evaluar. En la página Variables, el botón Recalcular actualiza las fórmulas que la usan.
        </li>
        <li>Están las funciones de la solapa Funciones, no todas las de Excel.</li>
        <li>
          Hay funciones <strong>propias de Kalc</strong>, que Excel no tiene: en la solapa Funciones llevan la marca
          <em>propia de Kalc</em> y su descripción dice cómo se escribe lo mismo en Excel. Por ejemplo, <code>CONTIENE</code>
          es <code>ESNUMERO(HALLAR(…))</code>. Una fórmula que las use, copiada a Excel, da <code>#¿NOMBRE?</code>.
        </li>
      </ul>
    </section>

    <section v-if="repositorio" class="panel">
      <h2 class="panel-titulo">El proyecto</h2>
      <p>El código de las tres partes (el motor, kalc-backend y esta aplicación) y cómo se relacionan están en el repositorio:</p>
      <p class="mb-0"><EnlaceRepositorio /></p>
    </section>
  </div>
</template>

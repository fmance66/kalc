// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cargarVariables, catalogo } from '../catalogo.ts'
import { busquedaVariables } from '../busquedas.ts'
import { conexiones } from '../conexiones.ts'
import type { EjecutorConsultas, Tabla, Valor, Variable } from 'kalc'
import { CLAVE, repositorioLocal } from '../persistencia/localStorage.ts'
import { boton, montar } from '../pruebas/montar.ts'
import PaginaVariables from './PaginaVariables.vue'

const numero = (nombre: string, valor: number): Variable => ({ nombre, tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor } } })
const formula = (nombre: string, texto: string): Variable => ({ nombre, tipo: 'numero', origen: { clase: 'formula', texto } })

const consultaDe = (nombre: string): Variable => ({ nombre, tipo: 'numero', origen: { clase: 'consulta', sql: `select 1 from ${nombre}` } })

/** Por defecto, el ejecutor no responde nunca: las consultas quedan esperando. */
async function abrir(variables: Variable[] = [], ejecutor: EjecutorConsultas = () => new Promise<Valor>(() => {})) {
  localStorage.clear()
  const repo = repositorioLocal()
  await repo.reemplazarTodas(variables)
  await cargarVariables(repo, ejecutor)
  return montar(PaginaVariables)
}

type Pagina = Awaited<ReturnType<typeof abrir>>
const fila = (p: Pagina, nombre: string) => p.find(`tr[data-variable="${nombre}"]`)
const resultado = (p: Pagina, nombre: string) => fila(p, nombre).find('[data-prueba="resultado"]').text()
const estado = (p: Pagina, nombre: string) => fila(p, nombre).find('[data-prueba="estado"]').text()
const guardadas = () => (JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as { variables: Variable[] }).variables

/** Escribe en un campo de la fila y lo confirma (como al salir del campo o apretar Enter). */
async function escribir(p: Pagina, nombre: string, campo: string, valor: string) {
  const el = fila(p, nombre).find(`[aria-label="${campo}"]`)
  await el.setValue(valor)
  await el.trigger('change')
  await flushPromises()
}

beforeEach(() => {
  vi.unstubAllGlobals()
  conexiones.value = null
  busquedaVariables.value = ''
})

describe('Variables', () => {
  it('sin variables lo dice, y ya no ofrece cargar el ejemplo (lo pregunta la App al arrancar)', async () => {
    const p = await abrir()
    expect(p.find('.vacio strong').text()).toBe('Sin variables')
    expect(p.findAll('button').some((b) => b.text().includes('ejemplo'))).toBe(false)
  })

  it('muestra valor, resultado y estado de cada una', async () => {
    const p = await abrir([numero('Neto', 100), formula('Total', 'Neto*2'), formula('Mal', 'Nada+1'), formula('A', 'B'), formula('B', 'A')])
    expect((fila(p, 'Neto').find('[aria-label="Valor"]').element as HTMLInputElement).value).toBe('100')
    expect((fila(p, 'Total').find('[aria-label="Fórmula"]').element as HTMLInputElement).value).toBe('Neto*2')
    expect(resultado(p, 'Total')).toBe('200')
    expect(estado(p, 'Total')).toContain('OK')
    expect(estado(p, 'Mal')).toBe('No existe: Nada')
    expect(estado(p, 'A')).toBe('Ciclo: A → B → A')
  })

  it('al cambiar una constante recalcula al instante lo que depende de ella, y lo resalta', async () => {
    const p = await abrir([numero('Neto', 100), formula('Total', 'Neto*2'), numero('Otra', 1)])
    await escribir(p, 'Neto', 'Valor', '1.500,5')
    expect(resultado(p, 'Total')).toBe('3001')
    expect(fila(p, 'Total').classes()).toContain('fila-recalculada')
    expect(fila(p, 'Otra').classes()).not.toContain('fila-recalculada')
    expect(guardadas()[0]).toEqual(numero('Neto', 1500.5))
  })

  it('un valor que no es del tipo no se guarda, y lo avisa en la fila', async () => {
    const p = await abrir([numero('Neto', 100)])
    await escribir(p, 'Neto', 'Valor', 'mucho')
    expect(estado(p, 'Neto')).toContain('No se guardó: No es un número')
    expect(catalogo.value.estado('Neto')?.valor).toEqual({ tipo: 'numero', valor: 100 })
  })

  it('marca el error de sintaxis de una fórmula, y el tipo que no coincide', async () => {
    const p = await abrir([formula('F', '1')])
    // Con coma después de un valor: el error típico de la sintaxis en inglés.
    await escribir(p, 'F', 'Fórmula', 'SI(F,1)')
    expect(estado(p, 'F')).toContain('punto y coma')
    expect(fila(p, 'F').find('mark').text()).toBe(',')
    await escribir(p, 'F', 'Fórmula', '"hola"')
    expect(estado(p, 'F')).toBe('Da un texto y se declaró número')
  })

  it('cambiar de constante a fórmula usa lo escrito como fórmula', async () => {
    const p = await abrir([numero('A', 2), numero('B', 3)])
    await escribir(p, 'B', 'Valor', 'A*10')
    expect(estado(p, 'B')).toContain('No se guardó')
    await fila(p, 'B').find('[aria-label="Clase"]').setValue('formula')
    await flushPromises()
    expect(resultado(p, 'B')).toBe('20')
  })

  it('una consulta conserva los saltos de línea del SQL y queda esperando hasta que responde', async () => {
    const sql = 'select last_name\nfrom employees\nwhere employee_id = 208'
    let responder = (_v: Valor) => {}
    const p = await abrir([{ nombre: 'Apellido', tipo: 'texto', origen: { clase: 'consulta', sql } }], () => new Promise<Valor>((r) => (responder = r)))
    const campo = fila(p, 'Apellido').find('[aria-label="Consulta"]')
    expect(campo.element.tagName).toBe('TEXTAREA')
    expect((campo.element as HTMLTextAreaElement).value).toBe(sql)
    expect(estado(p, 'Apellido')).toBe('Esperando la consulta a la base')
    responder({ tipo: 'texto', valor: 'Ernst' })
    await flushPromises()
    expect(resultado(p, 'Apellido')).toBe('Ernst')
    expect(estado(p, 'Apellido')).toContain('OK')
  })

  it('una consulta de tipo tabla muestra su tamaño y sus filas, y las fórmulas usan sus columnas', async () => {
    const tabla: Tabla = { columnas: ['PRODUCTO', 'IMPORTE'], filas: [[{ tipo: 'texto', valor: 'Yerba' }, { tipo: 'numero', valor: 100 }], [{ tipo: 'texto', valor: 'Café' }, { tipo: 'vacio' }]] }
    const p = await abrir([{ nombre: 'Ventas', tipo: 'tabla', origen: { clase: 'consulta', sql: 'select producto, importe from ventas' } }, formula('Total', 'SUMA(Ventas[Importe])')], async () => tabla)
    await flushPromises()
    const celda = fila(p, 'Ventas').find('[data-prueba="resultado"]')
    expect(celda.find('summary').text()).toBe('2 filas × 2 columnas')
    expect(celda.findAll('tbody tr').map((f) => f.text())).toEqual(['Yerba100', 'Café'])
    expect(estado(p, 'Ventas')).toContain('OK')
    expect(resultado(p, 'Total')).toBe('100')
  })

  it('elegir el tipo Tabla pasa una constante a Datos; los datos se escriben con ; y la primera línea es el encabezado', async () => {
    const p = await abrir([numero('T', 1)])
    await escribir(p, 'T', 'Tipo', 'tabla')
    expect((fila(p, 'T').find('[aria-label="Clase"]').element as HTMLSelectElement).value).toBe('datos')
    // Vacío no se puede guardar: lo avisa.
    expect(estado(p, 'T')).toContain('Falta la primera línea')
    await escribir(p, 'T', 'Datos', 'Tipo;Alicuota\nGeneral;0,21\nReducida;0,105')
    expect(guardadas()[0]).toEqual({
      nombre: 'T',
      tipo: 'tabla',
      origen: {
        clase: 'datos',
        tabla: {
          columnas: ['Tipo', 'Alicuota'],
          filas: [
            [{ tipo: 'texto', valor: 'General' }, { tipo: 'numero', valor: 0.21 }],
            [{ tipo: 'texto', valor: 'Reducida' }, { tipo: 'numero', valor: 0.105 }],
          ],
        },
      },
    })
    expect(fila(p, 'T').find('[data-prueba="resultado"] summary').text()).toBe('2 filas × 2 columnas')
    // En una tabla no se ofrece Constante; en un número, no se ofrece Datos.
    expect(fila(p, 'T').findAll('[aria-label="Clase"] option').map((o) => o.text())).toEqual(['Fórmula', 'Consulta', 'Datos'])
  })

  it('una tabla suma columnas calculadas con [@Columna], y una fórmula puede dar una tabla', async () => {
    const tabla = { nombre: 'T', tipo: 'tabla' as const, origen: { clase: 'datos' as const, tabla: { columnas: ['A'], filas: [[{ tipo: 'numero' as const, valor: 1 }], [{ tipo: 'numero' as const, valor: 2 }]] } } }
    const p = await abrir([tabla, { nombre: 'Grandes', tipo: 'tabla', origen: { clase: 'formula', texto: 'FILTRAR(T; T[A] > 1)' } }, formula('Suma', 'SUMA(T[Doble])')])
    expect(fila(p, 'Grandes').find('[data-prueba="resultado"] summary').text()).toBe('1 fila × 1 columna')
    await fila(p, 'T').find('[data-prueba="columnas"] button').trigger('click')
    await escribir(p, 'T', 'Nombre de la columna', 'Doble')
    await escribir(p, 'T', 'Fórmula de la columna', '[@A] * 2')
    expect(guardadas()[0]).toEqual({ ...tabla, columnas: [{ nombre: 'Doble', formula: '[@A] * 2' }] })
    expect(resultado(p, 'Suma')).toBe('6')
    await fila(p, 'T').find('button[aria-label="Quitar la columna Doble"]').trigger('click')
    await flushPromises()
    expect(guardadas()[0]).toEqual(tabla)
    expect(resultado(p, 'Suma')).toBe('#¡REF!')
  })

  it('al editar el SQL lo guarda tal cual y vuelve a correr la consulta', async () => {
    const sql = 'select 1\nfrom dual'
    const recibidas: string[] = []
    const p = await abrir([{ nombre: 'Q', tipo: 'numero', origen: { clase: 'consulta', sql } }], async (c) => {
      recibidas.push(c.sql)
      return { tipo: 'numero', valor: recibidas.length }
    })
    await flushPromises()
    await escribir(p, 'Q', 'Consulta', `${sql}\nwhere 1 = 1`)
    expect(guardadas()[0]?.origen).toEqual({ clase: 'consulta', sql: `${sql}\nwhere 1 = 1` })
    expect(recibidas).toEqual([sql, `${sql}\nwhere 1 = 1`])
    expect(resultado(p, 'Q')).toBe('2')
  })

  it('con varias conexiones, una consulta elige en cuál corre; guarda y la vuelve a correr', async () => {
    conexiones.value = { conexiones: ['juzgado', 'reportes'], porDefecto: 'juzgado' }
    const recibidas: (string | undefined)[] = []
    const p = await abrir([consultaDe('Q'), numero('N', 1)], async (c) => {
      recibidas.push(c.conexion)
      return { tipo: 'numero', valor: 1 }
    })
    await flushPromises()
    const opciones = fila(p, 'Q').findAll('[aria-label="Conexión"] option').map((o) => o.text())
    expect(opciones).toEqual(['Por defecto (juzgado)', 'juzgado', 'reportes'])
    expect(fila(p, 'N').find('[aria-label="Conexión"]').exists()).toBe(false)
    await escribir(p, 'Q', 'Conexión', 'reportes')
    expect(guardadas()[0]?.origen).toEqual({ clase: 'consulta', sql: 'select 1 from Q', conexion: 'reportes' })
    expect(recibidas).toEqual([undefined, 'reportes'])
    await escribir(p, 'Q', 'Conexión', '')
    expect(guardadas()[0]?.origen).toEqual({ clase: 'consulta', sql: 'select 1 from Q' })
  })

  it('con una sola conexión no hay qué elegir; la de una variable que el servidor no tiene se ve igual', async () => {
    conexiones.value = { conexiones: ['juzgado'], porDefecto: 'juzgado' }
    const otra: Variable = { nombre: 'Otra', tipo: 'numero', origen: { clase: 'consulta', sql: 'select 1 from dual', conexion: 'reportes' } }
    const p = await abrir([consultaDe('Q'), otra])
    expect(fila(p, 'Q').find('[aria-label="Conexión"]').exists()).toBe(false)
    const elegida = fila(p, 'Otra').find('[aria-label="Conexión"]')
    expect((elegida.element as HTMLSelectElement).value).toBe('reportes')
    expect(elegida.findAll('option').map((o) => o.text())).toEqual(['Por defecto (juzgado)', 'juzgado', 'reportes (no está en el servidor)'])
  })

  it('el botón de la fila vuelve a correr esa consulta; Recalcular, todas', async () => {
    const recibidas: string[] = []
    const p = await abrir([consultaDe('A'), consultaDe('B')], async (c) => {
      recibidas.push(c.nombre)
      return { tipo: 'numero', valor: 1 }
    })
    await flushPromises()
    await fila(p, 'B').find('[aria-label="Recalcular B"]').trigger('click')
    await flushPromises()
    expect(recibidas).toEqual(['A', 'B', 'B'])
    await boton(p, 'Recalcular').trigger('click')
    await flushPromises()
    expect(recibidas).toEqual(['A', 'B', 'B', 'A', 'B'])
  })

  it('una consulta falla con el mensaje del ejecutor', async () => {
    const p = await abrir([consultaDe('Q')], async () => {
      throw new Error('ORA-00942: table or view does not exist')
    })
    await flushPromises()
    expect(resultado(p, 'Q')).toBe('#¡VALOR!')
    expect(estado(p, 'Q')).toBe('ORA-00942: table or view does not exist')
  })

  it('renombrar corrige las fórmulas que la usan; no deja repetir un nombre', async () => {
    const p = await abrir([numero('Neto', 100), formula('Total', 'Neto*2')])
    await escribir(p, 'Neto', 'Nombre', 'Base imponible')
    expect((fila(p, 'Total').find('[aria-label="Fórmula"]').element as HTMLInputElement).value).toBe('[Base imponible]*2')
    expect(resultado(p, 'Total')).toBe('200')
    // Se guarda de a una: la renombrada se borra con el nombre viejo y entra al final, como en la base.
    expect(guardadas().map((v) => v.nombre)).toEqual(['Total', 'Base imponible'])
    await escribir(p, 'Total', 'Nombre', 'base imponible')
    expect(estado(p, 'Total')).toContain('Ya existe')
    await escribir(p, 'Total', 'Nombre', 'A1')
    expect(estado(p, 'Total')).toContain('referencia de celda')
  })

  it('la búsqueda filtra por nombre, descripción o fórmula, sin distinguir acentos', async () => {
    const p = await abrir([numero('Neto', 100), { ...formula('IVA', 'Neto*0,21'), descripcion: 'Alícuota general' }, formula('Total', 'Neto+IVA')])
    const buscar = p.find('[aria-label="Buscar variables"]')
    const nombres = () => p.findAll('tr[data-variable]').map((f) => f.attributes('data-variable'))
    await buscar.setValue('alicuota')
    expect(nombres()).toEqual(['IVA'])
    await buscar.setValue('neto+')
    expect(nombres()).toEqual(['Total'])
    await buscar.setValue('nada')
    expect(p.find('.vacio strong').text()).toBe('Ninguna coincide')
    // Al agregar se borra la búsqueda: la nueva tiene que verse.
    await boton(p, 'Agregar').trigger('click')
    await flushPromises()
    expect(nombres()).toEqual(['Neto', 'IVA', 'Total', 'Variable4'])
  })

  it('la búsqueda sigue al volver a la página', async () => {
    const variables = [numero('Neto', 100), formula('Total', 'Neto*2')]
    await (await abrir(variables)).find('[aria-label="Buscar variables"]').setValue('total')
    const p = await abrir(variables)
    expect((p.find('[aria-label="Buscar variables"]').element as HTMLInputElement).value).toBe('total')
    expect(p.findAll('tr[data-variable]').map((f) => f.attributes('data-variable'))).toEqual(['Total'])
  })

  it('ordena por nombre o por tipo (y por nombre dentro de cada tipo); el tercer clic vuelve al orden guardado', async () => {
    const p = await abrir([numero('neto', 1), { ...formula('Categoria', 'SI(neto>0;"a";"b")'), tipo: 'texto' }, numero('Alicuota', 0.21)])
    const nombres = () => p.findAll('tr[data-variable]').map((f) => f.attributes('data-variable'))
    await boton(p, 'Nombre').trigger('click')
    expect(nombres()).toEqual(['Alicuota', 'Categoria', 'neto'])
    await boton(p, 'Nombre').trigger('click')
    expect(nombres()).toEqual(['neto', 'Categoria', 'Alicuota'])
    await boton(p, 'Nombre').trigger('click')
    expect(nombres()).toEqual(['neto', 'Categoria', 'Alicuota'])
    await boton(p, 'Tipo').trigger('click')
    expect(nombres()).toEqual(['Alicuota', 'neto', 'Categoria'])
  })

  it('el pie dice cuántas son, y cuántas se ven al buscar', async () => {
    const p = await abrir([numero('Neto', 1), numero('IVA', 2), numero('Total', 3)])
    expect(p.find('[data-prueba="total"]').text()).toBe('3 variables')
    await p.find('[aria-label="Buscar variables"]').setValue('iva')
    expect(p.find('[data-prueba="total"]').text()).toBe('1 de 3 variables')
  })

  it('agrega una variable vacía y la quita', async () => {
    const p = await abrir([numero('Neto', 100), formula('Total', 'Neto*2')])
    await boton(p, 'Agregar').trigger('click')
    await flushPromises()
    expect(fila(p, 'Variable3').exists()).toBe(true)
    await fila(p, 'Neto').find('button[aria-label="Quitar Neto"]').trigger('click')
    await flushPromises()
    expect(fila(p, 'Neto').exists()).toBe(false)
    expect(estado(p, 'Total')).toBe('No existe: Neto')
    expect(guardadas().map((v) => v.nombre)).toEqual(['Total', 'Variable3'])
  })

  it('importa un JSON (reemplazando, con confirmación) y descarta lo que no tiene el formato', async () => {
    const p = await abrir([numero('Vieja', 1)])
    // happy-dom no tiene confirm.
    const confirmar = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmar)
    const archivo = new File([JSON.stringify({ version: 1, variables: [numero('X', 2), formula('Y', 'X*3'), { nombre: 'roto' }, numero('A1', 1)] })], 'v.json')
    const input = p.find('[data-prueba="archivo"]')
    Object.defineProperty(input.element, 'files', { value: [archivo], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(confirmar).toHaveBeenCalled()
    expect(fila(p, 'Vieja').exists()).toBe(false)
    expect(resultado(p, 'Y')).toBe('6')
    expect(p.find('[role="alert"]').text()).toBe('Se importaron 2 variables (2 descartadas: no tenían el formato esperado).')
  })
})

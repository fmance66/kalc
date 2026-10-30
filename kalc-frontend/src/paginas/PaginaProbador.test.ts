// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { cargarVariables, definirVariable } from '../catalogo.ts'
import { CLAVE_HISTORIAL } from '../historial.ts'
import { repositorioLocal } from '../persistencia/localStorage.ts'
import { boton, montar } from '../pruebas/montar.ts'
import PaginaProbador from './PaginaProbador.vue'

const resultado = (p: ReturnType<typeof montar>) => p.find('[data-prueba="resultado"]')

describe('Probador', () => {
  // Cada test arranca sin historial: si no, "Probar" muestra lo de los anteriores y no los ejemplos.
  beforeEach(() => localStorage.removeItem(CLAVE_HISTORIAL))

  it('calcula al abrir, y después con Enter o con el botón Calcular', async () => {
    const p = montar(PaginaProbador)
    expect(resultado(p).text()).toBe('7')
    await p.find('#formula').setValue('10/4')
    // Todavía no: queda el resultado anterior, atenuado.
    expect(resultado(p).text()).toBe('7')
    expect(p.find('.resultado-desactualizado').exists()).toBe(true)
    await p.find('#formula').trigger('keydown', { key: 'Enter' })
    expect(resultado(p).text()).toBe('2,5')
    expect(p.find('.resultado-desactualizado').exists()).toBe(false)
    await p.find('#formula').setValue('2^10')
    await boton(p, 'Calcular').trigger('click')
    expect(resultado(p).text()).toBe('1024')
  })

  it('la "x" borra la fórmula y el resultado', async () => {
    const p = montar(PaginaProbador)
    await p.find('button[aria-label="Borrar"]').trigger('click')
    expect((p.find('#formula').element as HTMLInputElement).value).toBe('')
    expect(resultado(p).exists()).toBe(false)
    expect(p.find('button[aria-label="Borrar"]').exists()).toBe(false)
  })

  it('marca un error de sintaxis donde está, con el mensaje', async () => {
    const p = montar(PaginaProbador)
    await p.find('#formula').setValue('SI(A,1)')
    expect(p.find('[role="alert"]').exists()).toBe(false)
    await boton(p, 'Calcular').trigger('click')
    expect(p.find('[role="alert"]').text()).toContain('punto y coma')
    expect(p.find('.formula-marcada mark').text()).toBe(',')
    expect(resultado(p).exists()).toBe(false)
  })

  it('muestra el árbol con las precedencias de Excel', async () => {
    const p = montar(PaginaProbador)
    await boton(p, '-2^2').trigger('click')
    expect(resultado(p).text()).toBe('4')
    const etiquetas = p.findAll('.arbol-etiqueta').map((e) => e.text())
    expect(etiquetas).toEqual(['^', '-', '2', '2'])
  })

  it('al pasar por un nodo resalta su parte en la copia de la fórmula del árbol', async () => {
    const p = montar(PaginaProbador)
    const copia = () => p.find('[data-prueba="arbol-formula"]')
    expect(copia().text()).toBe('1+2*3')
    expect(copia().find('mark').exists()).toBe(false)
    await p.findAll('.arbol-fila')[2]?.trigger('mouseenter')
    expect(copia().find('mark').text()).toBe('2*3')
    // Debajo del campo no se repite: ahí solo se marca un error de sintaxis.
    expect(p.findAll('.formula-marcada mark')).toHaveLength(1)
  })

  it('usa las variables cargadas y se actualiza si cambian', async () => {
    localStorage.clear()
    await cargarVariables(repositorioLocal())
    await definirVariable({ nombre: 'Base imponible', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 100 } } })
    const p = montar(PaginaProbador)
    await p.find('#formula').setValue('[Base imponible] * 2')
    await boton(p, 'Calcular').trigger('click')
    expect(resultado(p).text()).toBe('200')
    await definirVariable({ nombre: 'Base imponible', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 7 } } })
    await p.vm.$nextTick()
    expect(resultado(p).text()).toBe('14')
  })

  it('dice por qué falla: la consulta de una tabla que usa, también a través de otra variable, y lo que no existe', async () => {
    localStorage.clear()
    // La consulta falla: la tabla queda sin cargar y la fórmula da #¡VALOR!.
    await cargarVariables(repositorioLocal(), async () => {
      throw new Error('ORA-12541: no hay listener')
    })
    await definirVariable({ nombre: 'Solicitudes', tipo: 'tabla', origen: { clase: 'consulta', sql: 'select estado from t' } })
    await definirVariable({ nombre: 'Cantidad', tipo: 'entero', origen: { clase: 'formula', texto: 'FILAS(Solicitudes)' } })
    const p = montar(PaginaProbador)
    await p.find('#formula').setValue('FILTRAR(Solicitudes; Solicitudes[ESTADO] = "PENDIENTE")')
    await boton(p, 'Calcular').trigger('click')
    expect(resultado(p).text()).toBe('#¡VALOR!')
    expect(p.find('[data-prueba="avisos"]').text()).toBe('Solicitudes: la consulta falló: ORA-12541: no hay listener')
    await p.find('#formula').setValue('[Cantidad] + Otra')
    await boton(p, 'Calcular').trigger('click')
    expect(p.findAll('[data-prueba="avisos"] li').map((l) => l.text())).toEqual([
      'Otra: no existe',
      'Solicitudes: la consulta falló: ORA-12541: no hay listener',
    ])
  })

  it('sin problemas en las variables que usa, no hay avisos', async () => {
    localStorage.clear()
    await cargarVariables(repositorioLocal())
    await definirVariable({ nombre: 'Base imponible', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 100 } } })
    const p = montar(PaginaProbador)
    await p.find('#formula').setValue('[Base imponible] * 2')
    await boton(p, 'Calcular').trigger('click')
    expect(p.find('[data-prueba="avisos"]').exists()).toBe(false)
  })

  it('los ejemplos que usan variables solo aparecen si están cargadas', async () => {
    localStorage.clear()
    await cargarVariables(repositorioLocal())
    const p = montar(PaginaProbador)
    const ejemplos = () => p.findAll('.ejemplos:not([data-prueba]) button.ejemplo').map((b) => b.text())
    expect(ejemplos()).toContain('-2^2')
    expect(ejemplos()).toContain('REDONDEAR(1500 * 21%; 2)')
    expect(ejemplos().some((e) => e.includes('Expedientes'))).toBe(false)
    await definirVariable({ nombre: 'Expedientes vigentes', tipo: 'entero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 28 } } })
    await definirVariable({ nombre: 'Expedientes', tipo: 'tabla', origen: { clase: 'consulta', sql: 'select 1 from dual' } })
    await p.vm.$nextTick()
    expect(ejemplos()).toContain('TEXTO(CONTAR.SI(Expedientes[Estado]; 2) / [Expedientes vigentes]; "0%")')
  })

  it('en el árbol, una tabla dice Tabla (con su tamaño) y una columna, Columna', async () => {
    localStorage.clear()
    await cargarVariables(repositorioLocal())
    const p = montar(PaginaProbador)
    await p.find('#formula').setValue('FILAS(Causas) + SUMA(Causas[Monto])')
    await boton(p, 'Calcular').trigger('click')
    const filas = p.findAll('.arbol-fila').map((f) => f.text())
    expect(filas).toContain('TablaCausas6 filas × 4 columnas')
    expect(filas).toContain('ColumnaCausas[Monto]')
  })

  it('ofrece Causas, la tabla de los ejemplos, salvo que haya una variable con ese nombre', async () => {
    localStorage.clear()
    await cargarVariables(repositorioLocal())
    const p = montar(PaginaProbador)
    await p.find('#formula').setValue('SUMA(Causas[Monto])')
    await boton(p, 'Calcular').trigger('click')
    expect(resultado(p).text()).toBe('2960000')
    expect(p.find('[data-prueba="tablas-ejemplo"]').text()).toContain('Causas')
    await definirVariable({ nombre: 'Causas', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 1 } } })
    await p.vm.$nextTick()
    expect(resultado(p).text()).toBe('#¡REF!')
    expect(p.find('[data-prueba="tablas-ejemplo"]').exists()).toBe(false)
  })

  it('al escribir [ ofrece las variables; se elige con las flechas y Enter, sin calcular', async () => {
    localStorage.clear()
    await cargarVariables(repositorioLocal())
    await definirVariable({ nombre: 'Base imponible', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 100 } } })
    await definirVariable({ nombre: 'Bonificación', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 5 } } })
    const p = montar(PaginaProbador, { attachTo: document.body })
    const campo = p.find('#formula')
    await campo.setValue('2 * [b')
    const lista = () => p.find('[data-prueba="sugerencias"]')
    expect(lista().findAll('.sugerencia-nombre').map((o) => o.text())).toEqual(['Base imponible', 'Bonificación'])
    expect(lista().text()).toContain('Número · 100')
    await campo.trigger('keydown', { key: 'ArrowDown' })
    await campo.trigger('keydown', { key: 'Enter' })
    expect((campo.element as HTMLInputElement).value).toBe('2 * [Bonificación]')
    expect(lista().exists()).toBe(false)
    // El Enter eligió la variable: el resultado sigue siendo el de antes.
    expect(resultado(p).text()).toBe('7')
    await campo.trigger('keydown', { key: 'Enter' })
    expect(resultado(p).text()).toBe('10')
    p.unmount()
  })

  it('pegado a una tabla ofrece sus columnas, y Escape cierra la lista', async () => {
    localStorage.clear()
    await cargarVariables(repositorioLocal())
    const p = montar(PaginaProbador, { attachTo: document.body })
    const campo = p.find('#formula')
    await campo.setValue('SUMA(Causas[')
    expect(p.find('[data-prueba="sugerencias"]').text()).toContain('Columnas de Causas')
    await p.findAll('.sugerencia').find((o) => o.text() === 'Monto')!.trigger('mousedown')
    expect((campo.element as HTMLInputElement).value).toBe('SUMA(Causas[Monto]')
    await campo.setValue('[')
    expect(p.find('[data-prueba="sugerencias"]').exists()).toBe(true)
    await campo.trigger('keydown', { key: 'Escape' })
    expect(p.find('[data-prueba="sugerencias"]').exists()).toBe(false)
    p.unmount()
  })

  it('con Ctrl+Espacio ofrece las variables sin escribir [, y las inserta sin corchetes si no hacen falta', async () => {
    localStorage.clear()
    await cargarVariables(repositorioLocal())
    await definirVariable({ nombre: 'Neto', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 100 } } })
    await definirVariable({ nombre: 'Base imponible', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 50 } } })
    const p = montar(PaginaProbador, { attachTo: document.body })
    const campo = p.find('#formula')
    const lista = () => p.find('[data-prueba="sugerencias"]')
    await campo.setValue('2 * ne')
    expect(lista().exists()).toBe(false)
    await campo.trigger('keydown', { key: ' ', code: 'Space', ctrlKey: true })
    expect(lista().findAll('.sugerencia-nombre').map((o) => o.text())).toEqual(['Neto'])
    await campo.trigger('keydown', { key: 'Enter' })
    expect((campo.element as HTMLInputElement).value).toBe('2 * Neto')
    await campo.setValue('2 * Neto + ')
    await campo.trigger('keydown', { key: ' ', code: 'Space', ctrlKey: true })
    await campo.trigger('keydown', { key: 'ArrowDown' })
    await campo.trigger('keydown', { key: 'Tab' })
    expect((campo.element as HTMLInputElement).value).toBe('2 * Neto + [Base imponible]')
    await campo.trigger('keydown', { key: 'Enter' })
    expect(resultado(p).text()).toBe('250')
    p.unmount()
  })

  it('un clic en Probar calcula esa fórmula también con la fórmula como v-model (como en la App)', async () => {
    // La App pasa la fórmula con v-model: el prop recién cambia cuando el padre se actualiza.
    const p = montar(PaginaProbador, {
      props: { formula: '1+2*3', 'onUpdate:formula': (f: string) => p.setProps({ formula: f }) },
    })
    await boton(p, '-2^2').trigger('click')
    expect(resultado(p).text()).toBe('4')
    expect(p.find('.resultado').text()).not.toContain('la fórmula cambió')
    expect(p.find('.arbol-raiz').text()).toContain('-2^2')
    await p.find('#formula').setValue('10/4')
    await p.find('#formula').trigger('keydown', { key: 'Enter' })
    expect(resultado(p).text()).toBe('2,5')
    // Desde el historial: vuelve a -2^2, con su resultado y su árbol.
    await boton(p, '-2^2').trigger('click')
    expect(resultado(p).text()).toBe('4')
    expect(p.find('.arbol-raiz').text()).toContain('-2^2')
    expect(JSON.parse(localStorage.getItem(CLAVE_HISTORIAL)!)).toEqual(['-2^2', '10/4'])
  })

  it('"Probar" muestra lo que se fue probando, guardado, hasta borrar el historial', async () => {
    const p = montar(PaginaProbador)
    const probar = (q = p) => q.findAll('.ejemplos:not([data-prueba]) button.ejemplo').map((b) => b.text())
    await boton(p, '-2^2').trigger('click')
    await p.find('#formula').setValue('10/4')
    await p.find('#formula').trigger('keydown', { key: 'Enter' })
    expect(probar()).toEqual(['10/4', '-2^2'])
    expect(JSON.parse(localStorage.getItem(CLAVE_HISTORIAL)!)).toEqual(['10/4', '-2^2'])
    // Al volver a la página, sigue ahí.
    expect(probar(montar(PaginaProbador))).toEqual(['10/4', '-2^2'])
    await boton(p, 'Borrar historial').trigger('click')
    expect(localStorage.getItem(CLAVE_HISTORIAL)).toBeNull()
    expect(probar()).toContain('0,1+0,2=0,3')
    expect(p.find('.borrar-historial').exists()).toBe(false)
  })
})

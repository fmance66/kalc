// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { cargarVariables, catalogo } from './catalogo.ts'
import type { Variable } from 'kalc'
import { sinServidor } from './persistencia/api.ts'
import { CLAVE, repositorioLocal } from './persistencia/localStorage.ts'
import { boton, montar } from './pruebas/montar.ts'

/** Arranca como main.ts: carga lo guardado y después monta. */
async function arrancar(guardadas: Variable[]) {
  localStorage.clear()
  const repo = repositorioLocal()
  await repo.reemplazarTodas(guardadas)
  await cargarVariables(repo, sinServidor)
  return montar(App)
}

describe('App', () => {
  it('muestra las cuatro solapas y arranca en Probador', () => {
    const app = montar(App)
    const solapas = app.findAll('.solapas .nav-link').map((b) => b.text())
    expect(solapas).toEqual(['Probador', 'Variables', 'Funciones', 'Ayuda'])
    expect(app.find('.nav-link.active').text()).toBe('Probador')
    expect(app.find('#formula').exists()).toBe(true)
  })

  it('cambia de página al elegir una solapa', async () => {
    const app = montar(App)
    await boton(app, 'Variables').trigger('click')
    expect(app.find('.nav-link.active').text()).toBe('Variables')
    expect(app.find('.variables h2').text()).toBe('Variables')
  })

  it('la fórmula del Probador se conserva al ir a otra solapa y volver, y se muestra calculada', async () => {
    const app = montar(App)
    await app.find('#formula').setValue('2^10')
    await boton(app, 'Variables').trigger('click')
    await boton(app, 'Probador').trigger('click')
    expect((app.find('#formula').element as HTMLInputElement).value).toBe('2^10')
    expect(app.find('[data-prueba="resultado"]').text()).toBe('1024')
  })

  it('un ejemplo del catálogo de funciones se abre calculado en el Probador', async () => {
    const app = montar(App)
    await boton(app, 'Funciones').trigger('click')
    await app.find('[data-funcion="SI.ERROR"] button.ejemplo').trigger('click')
    expect(app.find('.nav-link.active').text()).toBe('Probador')
    expect((app.find('#formula').element as HTMLInputElement).value).toBe('SI.ERROR(1/0; "sin dato")')
    expect(app.find('[data-prueba="resultado"]').text()).toBe('sin dato')
  })

  it('un ejemplo de la Ayuda se abre calculado en el Probador', async () => {
    const app = montar(App)
    await boton(app, 'Ayuda').trigger('click')
    await boton(app, '-2^2').trigger('click')
    expect(app.find('.nav-link.active').text()).toBe('Probador')
    expect(app.find('[data-prueba="resultado"]').text()).toBe('4')
  })

  it('sin variables guardadas pregunta si cargar las de ejemplo; con Sí se calculan y se guardan', async () => {
    const app = await arrancar([])
    expect(app.find('[role="dialog"]').text()).toContain('No hay variables guardadas')
    await boton(app, 'Sí, cargarlas').trigger('click')
    await flushPromises()
    expect(app.find('[role="dialog"]').exists()).toBe(false)
    const c = catalogo.value
    expect(c.variables().length).toBeGreaterThan(5)
    expect(c.estado('Total')?.valor).toEqual({ tipo: 'numero', valor: 1210 })
    expect(c.estado('Situación')?.valor).toEqual({ tipo: 'texto', valor: 'En cuotas' })
    expect((JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as { variables: Variable[] }).variables).toHaveLength(c.variables().length)
  })

  it('con No, sigue sin variables', async () => {
    const app = await arrancar([])
    await boton(app, 'No').trigger('click')
    expect(app.find('[role="dialog"]').exists()).toBe(false)
    expect(catalogo.value.variables()).toEqual([])
  })

  it('con variables guardadas no pregunta', async () => {
    const app = await arrancar([{ nombre: 'A', tipo: 'numero', origen: { clase: 'formula', texto: '1' } }])
    expect(app.find('[role="dialog"]').exists()).toBe(false)
  })

  it('si falla la carga muestra el aviso; Reintentar vuelve a cargar y lo saca', async () => {
    let apagado = true
    const variables: Variable[] = [{ nombre: 'A', tipo: 'numero', origen: { clase: 'formula', texto: '1' } }]
    const repo = repositorioLocal()
    await repo.reemplazarTodas(variables)
    const listar = repo.listar
    repo.listar = async () => {
      if (apagado) throw new Error('No se pudo conectar con el servidor')
      return listar()
    }
    const silenciar = vi.spyOn(console, 'error').mockImplementation(() => {})
    await cargarVariables(repo, sinServidor)
    const app = montar(App)
    expect(app.find('[data-prueba="error-persistencia"]').text()).toContain('No se pudieron cargar las variables guardadas (No se pudo conectar con el servidor)')
    expect(app.find('[role="dialog"]').exists()).toBe(false)

    apagado = false
    await boton(app, 'Reintentar').trigger('click')
    await flushPromises()
    expect(app.find('[data-prueba="error-persistencia"]').exists()).toBe(false)
    expect(catalogo.value.variables()).toEqual(variables)
    silenciar.mockRestore()
  })
})

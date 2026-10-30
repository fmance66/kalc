// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { crearCatalogo, dependencias, parsear, type Valor } from 'kalc'
import { cargarVariables, catalogo } from '../catalogo.ts'
import { conexiones } from '../conexiones.ts'
import { CLAVE, repositorioLocal } from '../persistencia/localStorage.ts'
import { boton, montar } from '../pruebas/montar.ts'
import { VARIABLES_INICIALES } from '../pruebas/variablesIniciales.ts'
import { VARIABLES_POSTGRES } from '../pruebas/variablesPostgres.ts'
import PaginaAyuda from './PaginaAyuda.vue'

describe('Ayuda', () => {
  it('cada ejemplo del juzgado muestra el SQL de su variable inicial, y sus fórmulas usan variables que existen', async () => {
    const p = montar(PaginaAyuda)
    const ejemplos = p.findAll('.ayuda-ejemplo-sql')
    expect(ejemplos.length).toBeGreaterThan(0)
    const iniciales = new Set(VARIABLES_INICIALES.map((v) => v.nombre.toLowerCase()))
    for (const e of ejemplos) {
      const variable = VARIABLES_INICIALES.find((v) => v.nombre === e.attributes('data-ejemplo'))
      expect(variable?.origen.clase).toBe('consulta')
      expect(e.find('pre').text()).toBe(variable?.origen.clase === 'consulta' ? variable.origen.sql : '')
      for (const boton of e.findAll('button')) {
        const r = parsear(boton.text())
        expect(r.ok, boton.text()).toBe(true)
        if (r.ok) for (const d of dependencias(r.arbol)) expect(iniciales.has(d.toLowerCase()), `${boton.text()}: ${d}`).toBe(true)
      }
    }
  })

  describe('el enlace al repositorio', () => {
    afterEach(() => vi.unstubAllEnvs())

    it('enlaza al repositorio de package.json', () => {
      vi.stubEnv('VITE_REPOSITORIO', 'https://github.com/ejemplo/kalc')
      const enlace = montar(PaginaAyuda).find('[data-prueba="enlace-repositorio"]')
      expect(enlace.attributes('href')).toBe('https://github.com/ejemplo/kalc')
      expect(enlace.text()).toBe('Kalc — fórmulas al máximo nivel')
    })

    it('sin repositorio no lo muestra', () => {
      vi.stubEnv('VITE_REPOSITORIO', '')
      expect(montar(PaginaAyuda).find('[data-prueba="enlace-repositorio"]').exists()).toBe(false)
    })
  })

  it('un clic en una fórmula la manda al Probador', async () => {
    const p = montar(PaginaAyuda)
    await p.find('.ayuda-ejemplo-sql button').trigger('click')
    expect(p.emitted('probar')?.[0]).toEqual(['"Fuero " & [Nombre del fuero]'])
  })

  describe('ejemplos con PostgreSQL', () => {
    afterEach(() => {
      conexiones.value = null
      catalogo.value = crearCatalogo()
    })

    it('sin la conexión local (o sin servidor) no aparecen', () => {
      conexiones.value = { conexiones: ['juzgado', 'reportes'], porDefecto: 'juzgado' }
      expect(montar(PaginaAyuda).find('[data-seccion="postgres"]').exists()).toBe(false)
    })

    it('con ella, cada ejemplo muestra el SQL de su variable y sus fórmulas usan variables que existen', () => {
      conexiones.value = { conexiones: ['juzgado', 'local'], porDefecto: 'juzgado' }
      const seccion = montar(PaginaAyuda).find('[data-seccion="postgres"]')
      const ejemplos = seccion.findAll('.ayuda-ejemplo-sql')
      expect(ejemplos.length).toBeGreaterThan(0)
      const existen = new Set([...VARIABLES_POSTGRES, ...VARIABLES_INICIALES].map((v) => v.nombre.toLowerCase()))
      for (const e of ejemplos) {
        const variable = VARIABLES_POSTGRES.find((v) => v.nombre === e.attributes('data-ejemplo'))
        expect(variable?.origen.clase === 'consulta' && variable.origen.conexion).toBe('local')
        expect(e.find('pre').text()).toBe(variable?.origen.clase === 'consulta' ? variable.origen.sql : '')
        for (const b of e.findAll('button')) {
          const r = parsear(b.text())
          expect(r.ok, b.text()).toBe(true)
          if (r.ok) for (const d of dependencias(r.arbol)) expect(existen.has(d.toLowerCase()), `${b.text()}: ${d}`).toBe(true)
        }
      }
    })

    it('Agregarlas agrega solo las que faltan, sin tocar las que ya están', async () => {
      conexiones.value = { conexiones: ['local'], porDefecto: 'local' }
      const propia = { ...VARIABLES_POSTGRES[0]!, descripcion: 'cambiada a mano' }
      // En el navegador, con un ejecutor que no responde: las consultas quedan esperando.
      localStorage.clear()
      const repo = repositorioLocal()
      await repo.reemplazarTodas([propia])
      await cargarVariables(repo, () => new Promise<Valor>(() => {}))
      const p = montar(PaginaAyuda)
      expect(p.find('[data-seccion="postgres"]').text()).toContain(`Faltan ${VARIABLES_POSTGRES.length - 1} de sus ${VARIABLES_POSTGRES.length}`)
      await boton(p, 'Agregarlas').trigger('click')
      await flushPromises()
      expect(catalogo.value.variables().map((v) => v.nombre)).toEqual(VARIABLES_POSTGRES.map((v) => v.nombre))
      expect(catalogo.value.buscar(propia.nombre)?.descripcion).toBe('cambiada a mano')
      expect(JSON.parse(localStorage.getItem(CLAVE) ?? '{}').variables).toHaveLength(VARIABLES_POSTGRES.length)
      expect(p.find('[data-seccion="postgres"]').text()).toContain('ya están en Variables')
    })
  })
})

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { montar } from '../pruebas/montar.ts'
import BotonSubir from './BotonSubir.vue'

/** Simula haber bajado hasta `y` y avisa con el evento scroll, como el navegador. */
function bajarHasta(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
  window.dispatchEvent(new Event('scroll'))
}

afterEach(() => bajarHasta(0))

describe('BotonSubir', () => {
  it('aparece después de bajar 300px y se va al volver arriba', async () => {
    const b = montar(BotonSubir)
    expect(b.find('[aria-label="Volver arriba"]').exists()).toBe(false)
    bajarHasta(301)
    await b.vm.$nextTick()
    expect(b.find('[aria-label="Volver arriba"]').exists()).toBe(true)
    bajarHasta(0)
    await b.vm.$nextTick()
    expect(b.find('[aria-label="Volver arriba"]').exists()).toBe(false)
  })

  it('un clic sube al principio, sin saltar', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const b = montar(BotonSubir)
    bajarHasta(800)
    await b.vm.$nextTick()
    await b.find('[aria-label="Volver arriba"]').trigger('click')
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    scrollTo.mockRestore()
  })
})

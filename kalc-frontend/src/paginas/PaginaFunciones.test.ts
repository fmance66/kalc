// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { busquedaFunciones } from '../busquedas.ts'
import { montar } from '../pruebas/montar.ts'
import PaginaFunciones from './PaginaFunciones.vue'

const fila = (p: ReturnType<typeof montar>, nombre: string) => p.find(`[data-funcion="${nombre}"]`)

beforeEach(() => {
  busquedaFunciones.value = ''
})

describe('Funciones', () => {
  it('lista las funciones por familia, con el ejemplo calculado', () => {
    const p = montar(PaginaFunciones)
    const titulos = p.findAll('.panel-titulo').map((t) => t.text())
    expect(titulos).toEqual(['Funciones', 'Lógicas', 'Matemáticas', 'Estadísticas', 'Búsqueda', 'Matrices', 'Texto', 'Fechas', 'Información'])
    // Las de Matrices dan una tabla.
    expect(fila(p, 'FILTRAR').find('.funcion-resultado-tabla summary').text()).toBe('2 filas × 4 columnas')
    expect(fila(p, 'SI').text()).toContain('IF')
    // Los de tablas, con la de ejemplo (que se muestra arriba).
    expect(fila(p, 'SUMAR.SI').find('.funcion-resultado').text()).toBe('660000')
    expect(p.find('.vista-tabla summary').text()).toBe('Causas · 6 filas × 4 columnas')
    expect(fila(p, 'REDONDEAR').find('.funcion-resultado').text()).toBe('2,68')
    expect(fila(p, 'HOY').text()).toContain('volátil')
  })

  it('busca por nombre, alias o descripción, sin distinguir acentos', async () => {
    const p = montar(PaginaFunciones)
    await p.find('#buscar-funcion').setValue('ano')
    expect(fila(p, 'AÑO').exists()).toBe(true)
    expect(fila(p, 'SI').exists()).toBe(false)
    await p.find('#buscar-funcion').setValue('iferror')
    expect(p.findAll('[data-funcion]').map((f) => f.attributes('data-funcion'))).toEqual(['SI.ERROR'])
    await p.find('#buscar-funcion').setValue('zzz')
    expect(p.find('.vacio strong').text()).toBe('Sin resultados')
  })

  it('la búsqueda sigue al volver a la página', async () => {
    montar(PaginaFunciones).find('#buscar-funcion').setValue('iferror')
    const p = montar(PaginaFunciones)
    expect((p.find('#buscar-funcion').element as HTMLInputElement).value).toBe('iferror')
    expect(p.findAll('[data-funcion]').map((f) => f.attributes('data-funcion'))).toEqual(['SI.ERROR'])
  })

  it('un clic en el ejemplo lo manda a probar', async () => {
    const p = montar(PaginaFunciones)
    await fila(p, 'SI.ERROR').find('button.ejemplo').trigger('click')
    expect(p.emitted('probar')).toEqual([['SI.ERROR(1/0; "sin dato")']])
  })
})

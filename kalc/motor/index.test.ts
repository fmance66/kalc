import { describe, expect, it } from 'vitest'
import * as api from './index.ts'

describe('API pública', () => {
  // Congelada desde la 1.0.0. Si este test falla: agregar algo es una versión minor; sacar o
  // renombrar algo rompe a quien usa la librería y es una versión major.
  it('exporta exactamente esto', () => {
    expect(Object.keys(api).sort()).toEqual([
      'CONTEXTO_EJEMPLOS',
      'ErrorConsulta',
      'ErrorSintaxis',
      'VACIO',
      'aLogico',
      'aNumero',
      'aTexto',
      'argEntero',
      'argNumero',
      'argTexto',
      'buscarFuncion',
      'codigoSql',
      'comparar',
      'crearCatalogo',
      'dependencias',
      'error',
      'esError',
      'esTabla',
      'esVariable',
      'escribirDatos',
      'evaluar',
      'evaluarArbol',
      'evaluarComoTabla',
      'fecha',
      'fechaASerie',
      'formatear',
      'hijos',
      'leerConstante',
      'leerDatos',
      'listarFunciones',
      'logico',
      'nombreEnFormula',
      'numero',
      'numeroATexto',
      'parametrosConsulta',
      'parsear',
      'problemaDeTipo',
      'redondear15',
      'registrarFuncion',
      'serieAFecha',
      'sirveComoParametro',
      'texto',
      'textoANumero',
      'validarNombre',
    ])
  })

  it('una función propia se arma solo con lo exportado', () => {
    api.registrarFuncion({
      nombre: 'PRUEBA.TOPE',
      minimo: 2,
      maximo: 2,
      evaluar: ([importe, tope]) => {
        const i = api.argNumero(importe)
        if (typeof i !== 'number') return i
        const t = api.argNumero(tope)
        if (typeof t !== 'number') return t
        return t < 0 ? api.error('#¡NUM!') : api.numero(Math.min(i, t))
      },
    })
    expect(api.formatear(api.evaluar('PRUEBA.TOPE(1500; 1000)'))).toBe('1000')
    expect(api.formatear(api.evaluar('PRUEBA.TOPE("abc"; 1000)'))).toBe('#¡VALOR!')
    expect(api.formatear(api.evaluar('PRUEBA.TOPE(1; -1)'))).toBe('#¡NUM!')
  })
})

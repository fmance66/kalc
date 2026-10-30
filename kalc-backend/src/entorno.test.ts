import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cargarEntorno } from './entorno.ts'

describe('cargarEntorno', () => {
  it('lee NOMBRE=valor, sin comentarios ni comillas, y no pisa lo ya definido', () => {
    const archivo = join(mkdtempSync(join(tmpdir(), 'kalc-')), '.env')
    writeFileSync(
      archivo,
      [
        '# comentario',
        'ORACLE_USUARIO=kalc',
        'ORACLE_CONEXION=(DESCRIPTION=(ADDRESS=(HOST=x)(PORT=1525)))',
        'ORACLE_CLAVE="con espacios"\r',
        'VACIA=',
        'PUERTO=8081',
      ].join('\n'),
    )
    const entorno: NodeJS.ProcessEnv = { PUERTO: '9000' }
    cargarEntorno(archivo, entorno)
    expect(entorno).toEqual({
      ORACLE_USUARIO: 'kalc',
      ORACLE_CONEXION: '(DESCRIPTION=(ADDRESS=(HOST=x)(PORT=1525)))',
      ORACLE_CLAVE: 'con espacios',
      VACIA: '',
      PUERTO: '9000',
    })
  })

  it('sin archivo no hace nada', () => {
    const entorno: NodeJS.ProcessEnv = {}
    cargarEntorno(join(tmpdir(), 'no-existe', '.env'), entorno)
    expect(entorno).toEqual({})
  })
})

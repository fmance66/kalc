import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { puertoOcupado } from './puerto.ts'

describe('puertoOcupado', () => {
  it('ocupado mientras alguien escucha, libre cuando deja de escuchar', async () => {
    const otro = createServer()
    await new Promise<void>((listo) => otro.listen(0, '127.0.0.1', listo))
    const { port } = otro.address() as AddressInfo
    expect(await puertoOcupado(port)).toBe(true)
    await new Promise((listo) => otro.close(listo))
    expect(await puertoOcupado(port)).toBe(false)
  })
})

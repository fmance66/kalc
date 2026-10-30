import { describe, expect, it, vi } from 'vitest'
import { atributosPool, ErrorConfiguracion, leerConfiguracion, pools, type DatosConexion } from './conexiones.ts'

const JUZGADO = '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=192.0.2.10)(PORT=1521))(CONNECT_DATA=(SID=ORCL)))'
const REPORTES = '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=192.0.2.20)(PORT=1521))(CONNECT_DATA=(SID=REPORTES)))'

const dosBases: NodeJS.ProcessEnv = {
  CONEXIONES: 'juzgado, Reportes',
  ORACLE_JUZGADO_USUARIO: 'kalc',
  ORACLE_JUZGADO_CLAVE: 'x',
  ORACLE_JUZGADO_CONEXION: JUZGADO,
  ORACLE_JUZGADO_ESQUEMA: 'kalc',
  ORACLE_REPORTES_USUARIO: 'consulta_ro',
  ORACLE_REPORTES_CLAVE: 'y',
  ORACLE_REPORTES_CONEXION: REPORTES,
}

describe('leerConfiguracion con CONEXIONES', () => {
  it('lee cada conexión por su nombre, en minúsculas; el almacén es la primera y las consultas, todas', () => {
    expect(leerConfiguracion(dosBases)).toEqual({
      conexiones: [
        { nombre: 'juzgado', tipo: 'oracle', usuario: 'kalc', clave: 'x', conexion: JUZGADO, esquema: 'kalc' },
        { nombre: 'reportes', tipo: 'oracle', usuario: 'consulta_ro', clave: 'y', conexion: REPORTES },
      ],
      almacen: 'juzgado',
      consultas: ['juzgado', 'reportes'],
    })
  })

  it('ALMACEN y CONSULTAS eligen entre las declaradas, sin distinguir mayúsculas', () => {
    const c = leerConfiguracion({ ...dosBases, ALMACEN: 'REPORTES', CONSULTAS: 'reportes' })
    expect(c.almacen).toBe('reportes')
    expect(c.consultas).toEqual(['reportes'])
  })

  it('CONSULTA_POR_DEFECTO pasa esa conexión adelante: es la de por defecto', () => {
    expect(leerConfiguracion({ ...dosBases, CONSULTA_POR_DEFECTO: 'Reportes' }).consultas).toEqual(['reportes', 'juzgado'])
    expect(leerConfiguracion({ ...dosBases, CONSULTAS: 'juzgado,reportes', CONSULTA_POR_DEFECTO: 'juzgado' }).consultas).toEqual(['juzgado', 'reportes'])
  })

  it.each<[string, NodeJS.ProcessEnv, string]>([
    ['falta un dato', { ...dosBases, ORACLE_REPORTES_CLAVE: '' }, 'Falta la variable de entorno ORACLE_REPORTES_CLAVE'],
    ['un nombre no sirve', { ...dosBases, CONEXIONES: 'juzgado,repor-tes' }, '"repor-tes" no sirve como nombre'],
    ['un nombre repetido', { ...dosBases, CONEXIONES: 'juzgado,JUZGADO' }, 'hay un nombre repetido'],
    ['ALMACEN no está', { ...dosBases, ALMACEN: 'otra' }, 'ALMACEN: "otra" no está en CONEXIONES (juzgado, reportes)'],
    ['CONSULTAS no está', { ...dosBases, CONSULTAS: 'reportes,otra' }, 'CONSULTAS: "otra" no está'],
    ['CONSULTA_POR_DEFECTO no está en CONSULTAS', { ...dosBases, CONSULTAS: 'reportes', CONSULTA_POR_DEFECTO: 'juzgado' }, 'CONSULTA_POR_DEFECTO: "juzgado" no está en las consultas (reportes)'],
    ['el esquema no es un identificador', { ...dosBases, ORACLE_JUZGADO_ESQUEMA: 'x; drop table t' }, 'no es un nombre de esquema'],
  ])('error si %s', (_caso, entorno, mensaje) => {
    expect(() => leerConfiguracion(entorno)).toThrow(ErrorConfiguracion)
    expect(() => leerConfiguracion(entorno)).toThrow(mensaje)
  })
})

describe('leerConfiguracion con una conexión PostgreSQL', () => {
  const conLocal: NodeJS.ProcessEnv = {
    ...dosBases,
    CONEXIONES: 'juzgado,reportes,local',
    POSTGRES_LOCAL_USUARIO: 'kalc_lectura',
    POSTGRES_LOCAL_CLAVE: 'z',
    POSTGRES_LOCAL_CONEXION: 'localhost:5432/kalc',
    POSTGRES_LOCAL_ESQUEMA: 'prueba, hr,scott',
  }

  it('POSTGRES_<NOMBRE>_* la declara PostgreSQL; el search_path queda sin espacios', () => {
    const c = leerConfiguracion(conLocal)
    expect(c.conexiones[2]).toEqual({ nombre: 'local', tipo: 'postgres', usuario: 'kalc_lectura', clave: 'z', conexion: 'localhost:5432/kalc', esquema: 'prueba,hr,scott' })
    expect(c.consultas).toEqual(['juzgado', 'reportes', 'local'])
  })

  it.each<[string, NodeJS.ProcessEnv, string]>([
    ['es el almacén', { ...conLocal, ALMACEN: 'local' }, 'ALMACEN: "local" es PostgreSQL'],
    ['tiene también variables ORACLE_', { ...conLocal, ORACLE_LOCAL_USUARIO: 'x' }, 'tiene variables ORACLE_LOCAL_* y POSTGRES_LOCAL_*'],
    ['la conexión no es host/base', { ...conLocal, POSTGRES_LOCAL_CONEXION: 'localhost:5432' }, 'POSTGRES_LOCAL_CONEXION tiene que ser host[:puerto]/base'],
    ['el esquema no es una lista de identificadores', { ...conLocal, POSTGRES_LOCAL_ESQUEMA: 'prueba; drop table t' }, 'no es una lista de esquemas'],
    ['falta un dato', { ...conLocal, POSTGRES_LOCAL_CLAVE: '' }, 'Falta la variable de entorno POSTGRES_LOCAL_CLAVE'],
  ])('error si %s', (_caso, entorno, mensaje) => {
    expect(() => leerConfiguracion(entorno)).toThrow(mensaje)
  })
})

describe('leerConfiguracion con el .env de antes', () => {
  const antes: NodeJS.ProcessEnv = { ORACLE_USUARIO: 'kalc', ORACLE_CLAVE: 'x', ORACLE_CONEXION: JUZGADO }

  it('ORACLE_* es la conexión principal, para todo', () => {
    expect(leerConfiguracion(antes)).toEqual({
      conexiones: [{ nombre: 'principal', tipo: 'oracle', usuario: 'kalc', clave: 'x', conexion: JUZGADO }],
      almacen: 'principal',
      consultas: ['principal'],
    })
  })

  it('con ORACLE_CONSULTAS_USUARIO las consultas corren solo con ese usuario, en la misma base si no dice otra', () => {
    const c = leerConfiguracion({ ...antes, ORACLE_ESQUEMA: 'kalc', ORACLE_CONSULTAS_USUARIO: 'ro', ORACLE_CONSULTAS_CLAVE: 'z' })
    expect(c).toEqual({
      conexiones: [
        { nombre: 'principal', tipo: 'oracle', usuario: 'kalc', clave: 'x', conexion: JUZGADO, esquema: 'kalc' },
        { nombre: 'consultas', tipo: 'oracle', usuario: 'ro', clave: 'z', conexion: JUZGADO },
      ],
      almacen: 'principal',
      consultas: ['consultas'],
    })
    expect(leerConfiguracion({ ...antes, ORACLE_CONSULTAS_USUARIO: 'ro', ORACLE_CONSULTAS_CLAVE: 'z', ORACLE_CONSULTAS_CONEXION: REPORTES }).conexiones[1]?.conexion).toBe(REPORTES)
  })

  it('error si falta un dato', () => {
    expect(() => leerConfiguracion({ ...antes, ORACLE_CONEXION: undefined })).toThrow('Falta la variable de entorno ORACLE_CONEXION')
    expect(() => leerConfiguracion({ ...antes, ORACLE_CONSULTAS_USUARIO: 'ro' })).toThrow('ORACLE_CONSULTAS_CLAVE')
  })
})

describe('atributosPool', () => {
  const d: DatosConexion = { nombre: 'juzgado', tipo: 'oracle', usuario: 'kalc', clave: 'x', conexion: JUZGADO }
  const tamanio = { poolMin: 0, poolMax: 4 }

  it('sin esquema, solo los datos de la conexión', () => {
    expect(atributosPool(d, tamanio)).toEqual({ user: 'kalc', password: 'x', connectString: JUZGADO, poolMin: 0, poolMax: 4 })
  })

  it('con esquema, cada sesión nueva lo fija', async () => {
    const a = atributosPool({ ...d, esquema: 'kalc' }, tamanio)
    const execute = vi.fn(async () => ({}))
    const callback = a.sessionCallback as (c: unknown, tag: string, listo: (e?: unknown) => void) => void
    const error = await new Promise((listo) => callback({ execute }, '', listo))
    expect(error).toBeUndefined()
    expect(execute).toHaveBeenCalledWith('ALTER SESSION SET CURRENT_SCHEMA = kalc')
  })

  it('si fijar el esquema falla, el pool recibe el error', async () => {
    const a = atributosPool({ ...d, esquema: 'otro' }, tamanio)
    const ora = new Error('ORA-01435: user does not exist')
    const callback = a.sessionCallback as (c: unknown, tag: string, listo: (e?: unknown) => void) => void
    const error = await new Promise((listo) => callback({ execute: async () => Promise.reject(ora) }, '', listo))
    expect(error).toBe(ora)
  })
})

describe('pools', () => {
  const conexiones = leerConfiguracion(dosBases).conexiones
  const falso = () => ({ close: vi.fn(async () => {}) })

  it('abre cada pool una sola vez, al pedirlo, sin distinguir mayúsculas', async () => {
    const abrir = vi.fn(async (_d: DatosConexion) => falso())
    const p = pools(conexiones, abrir)
    expect(abrir).not.toHaveBeenCalled()
    const a = await p.obtener('reportes')
    expect(await p.obtener('REPORTES')).toBe(a)
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(abrir.mock.calls[0]?.[0].nombre).toBe('reportes')
  })

  it('si abrirlo falla, lo vuelve a intentar en el próximo pedido', async () => {
    const abrir = vi.fn<(d: DatosConexion) => Promise<{ close(s: number): Promise<void> }>>().mockRejectedValueOnce(new Error('NJS-503')).mockResolvedValueOnce(falso())
    const p = pools(conexiones, abrir)
    await expect(p.obtener('juzgado')).rejects.toThrow('NJS-503')
    await expect(p.obtener('juzgado')).resolves.toBeDefined()
    expect(abrir).toHaveBeenCalledTimes(2)
  })

  it('una conexión que no existe es un error', async () => {
    await expect(pools(conexiones, async () => falso()).obtener('otra')).rejects.toThrow('No hay una conexión que se llame otra')
  })

  it('cerrar cierra los abiertos', async () => {
    const p = pools(conexiones, async () => falso())
    const a = await p.obtener('juzgado')
    await p.cerrar()
    expect(a.close).toHaveBeenCalledWith(10)
  })
})

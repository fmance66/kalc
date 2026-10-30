import oracledb from 'oracledb'
import { esVariable, type RepositorioVariables, type Variable } from 'kalc'

/** Lo que se usa del pool de oracledb: así los tests pasan uno falso. */
export interface Pool {
  getConnection(): Promise<Conexion>
}
export type Conexion = Pick<oracledb.Connection, 'execute' | 'commit' | 'rollback' | 'close'>

interface Fila {
  NOMBRE: string
  TIPO: string
  ORIGEN: string
  /** Las columnas calculadas de una tabla, en JSON (desde la 1.3.0: ver db/oracle/variables-1.3.0.sql). */
  COLUMNAS: string | null
  DESCRIPCION: string | null
}

// Los CLOB se traen como texto, y se mandan como CLOB: como VARCHAR2 se cortan en 4000 bytes.
const LEER = { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { ORIGEN: { type: oracledb.STRING }, COLUMNAS: { type: oracledb.STRING } } }

function binds(v: Variable) {
  return {
    nombre: v.nombre,
    tipo: v.tipo,
    origen: { val: JSON.stringify(v.origen), type: oracledb.DB_TYPE_CLOB },
    columnas: { val: v.columnas?.length ? JSON.stringify(v.columnas) : null, type: oracledb.DB_TYPE_CLOB },
    descripcion: v.descripcion ?? null,
  }
}

/** Una fila → Variable; `null` si está rota (JSON que no es un origen válido, tipo desconocido). */
export function aVariable(f: Fila): Variable | null {
  try {
    const v = {
      nombre: f.NOMBRE,
      tipo: f.TIPO,
      origen: JSON.parse(f.ORIGEN) as unknown,
      ...(f.COLUMNAS ? { columnas: JSON.parse(f.COLUMNAS) as unknown } : {}),
      ...(f.DESCRIPCION === null ? {} : { descripcion: f.DESCRIPCION }),
    }
    return esVariable(v) ? v : null
  } catch {
    return null
  }
}

const INSERTAR = 'INSERT INTO motor_variables (nombre, tipo, origen, columnas, descripcion) VALUES (:nombre, :tipo, :origen, :columnas, :descripcion)'
// Con MERGE no se puede: el nombre está en el ON y no se puede actualizar (ORA-38104), y un
// renombre que solo cambia mayúsculas lo necesita.
const ACTUALIZAR =
  'UPDATE motor_variables SET nombre = :nombre, tipo = :tipo, origen = :origen, columnas = :columnas, descripcion = :descripcion, modificado = SYSTIMESTAMP WHERE UPPER(nombre) = UPPER(:nombre)'

/** Las variables en la tabla `motor_variables` (ver db/oracle/variables.sql). */
export function repositorioOracle(pool: Pool): RepositorioVariables {
  /** Abre una conexión, corre `trabajo` en una transacción y la devuelve al pool. */
  async function conConexion<T>(trabajo: (c: Conexion) => Promise<T>): Promise<T> {
    const c = await pool.getConnection()
    try {
      const resultado = await trabajo(c)
      await c.commit()
      return resultado
    } catch (e) {
      await c.rollback()
      throw e
    } finally {
      await c.close()
    }
  }

  return {
    listar: () =>
      conConexion(async (c) => {
        const r = await c.execute<Fila>('SELECT nombre, tipo, origen, columnas, descripcion FROM motor_variables ORDER BY id', {}, LEER)
        return (r.rows ?? []).map(aVariable).filter((v) => v !== null)
      }),
    guardar: (variable) =>
      conConexion(async (c) => {
        const r = await c.execute(ACTUALIZAR, binds(variable))
        if (!r.rowsAffected) await c.execute(INSERTAR, binds(variable))
      }),
    borrar: (nombre) =>
      conConexion(async (c) => {
        await c.execute('DELETE FROM motor_variables WHERE UPPER(nombre) = UPPER(:nombre)', { nombre })
      }),
    // Todo en una transacción: si falla una, quedan las de antes.
    reemplazarTodas: (variables) =>
      conConexion(async (c) => {
        await c.execute('DELETE FROM motor_variables')
        for (const v of variables) await c.execute(INSERTAR, binds(v))
      }),
  }
}

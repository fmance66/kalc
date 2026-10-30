import { esVariable, type RepositorioVariables, type Variable } from 'kalc'
import type { ClientePostgres, PoolPostgres } from './postgres.ts'

interface Fila {
  nombre: string
  tipo: string
  origen: string
  /** Las columnas calculadas de una tabla, en JSON. */
  columnas: string | null
  descripcion: string | null
}

const valores = (v: Variable) => [v.nombre, v.tipo, JSON.stringify(v.origen), v.columnas?.length ? JSON.stringify(v.columnas) : null, v.descripcion ?? null]

/** Una fila → Variable; `null` si está rota (JSON que no es un origen válido, tipo desconocido). */
export function aVariable(f: Fila): Variable | null {
  try {
    const v = {
      nombre: f.nombre,
      tipo: f.tipo,
      origen: JSON.parse(f.origen) as unknown,
      ...(f.columnas ? { columnas: JSON.parse(f.columnas) as unknown } : {}),
      ...(f.descripcion === null ? {} : { descripcion: f.descripcion }),
    }
    return esVariable(v) ? v : null
  } catch {
    return null
  }
}

const INSERTAR = 'INSERT INTO motor_variables (nombre, tipo, origen, columnas, descripcion) VALUES ($1, $2, $3, $4, $5)'
// El conflicto es por upper(nombre): un renombre que solo cambia mayúsculas actualiza la fila, y el
// id (el orden) no cambia.
const GUARDAR = `${INSERTAR}
ON CONFLICT ((upper(nombre))) DO UPDATE SET nombre = excluded.nombre, tipo = excluded.tipo, origen = excluded.origen,
  columnas = excluded.columnas, descripcion = excluded.descripcion, modificado = now()`

/** Las variables en la tabla `motor_variables` (ver db/postgres/variables.sql). */
export function repositorioPostgres(pool: PoolPostgres): RepositorioVariables {
  /** Corre `trabajo` en una transacción y devuelve la conexión al pool. */
  async function enTransaccion<T>(trabajo: (c: ClientePostgres) => Promise<T>): Promise<T> {
    const c = await pool.connect()
    let roto = false
    try {
      await c.query('BEGIN')
      const resultado = await trabajo(c)
      await c.query('COMMIT')
      return resultado
    } catch (e) {
      // Si se cortó la conexión, ROLLBACK también falla: el pool la descarta en vez de reusarla.
      await c.query('ROLLBACK').catch(() => (roto = true))
      throw e
    } finally {
      c.release(roto)
    }
  }

  return {
    listar: () =>
      enTransaccion(async (c) => {
        const r = await c.query('SELECT nombre, tipo, origen, columnas, descripcion FROM motor_variables ORDER BY id')
        return (r.rows as Fila[]).map(aVariable).filter((v) => v !== null)
      }),
    guardar: (variable) =>
      enTransaccion(async (c) => {
        await c.query({ text: GUARDAR, values: valores(variable) })
      }),
    borrar: (nombre) =>
      enTransaccion(async (c) => {
        await c.query({ text: 'DELETE FROM motor_variables WHERE upper(nombre) = upper($1)', values: [nombre] })
      }),
    // Todo en una transacción: si falla una, quedan las de antes.
    reemplazarTodas: (variables) =>
      enTransaccion(async (c) => {
        await c.query('DELETE FROM motor_variables')
        for (const v of variables) await c.query({ text: INSERTAR, values: valores(v) })
      }),
  }
}

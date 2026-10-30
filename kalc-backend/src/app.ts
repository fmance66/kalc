import express, { type ErrorRequestHandler } from 'express'
import { ErrorConsulta, esVariable, parametrosConsulta, validarNombre, type RepositorioVariables, type Valor, type Variable } from 'kalc'
import { prepararSql, type EjecutarSql } from './consultas.ts'
import type { InfoVersion } from './version.ts'

/** Lo mismo que acepta la página Variables al importar. */
const esValida = (x: unknown): x is Variable => esVariable(x) && validarNombre(x.nombre) === null

/** Un valor que llega como parámetro de una consulta: el mismo control que el de una constante. */
const esValor = (x: unknown): x is Valor => esVariable({ nombre: 'x', tipo: 'numero', origen: { clase: 'constante', valor: x } })

/**
 * La API de variables, sobre cualquier repositorio (PostgreSQL en el servidor, uno en memoria en los
 * tests). Las rutas siguen la interfaz RepositorioVariables:
 *
 *   GET    /api/version            qué versión corre: { version, commit, fecha, kalc }
 *   GET    /api/conexiones         en qué bases pueden correr las consultas: { conexiones, porDefecto }
 *   GET    /api/variables          listar
 *   PUT    /api/variables/:nombre  guardar (agrega o reemplaza, sin distinguir mayúsculas)
 *   DELETE /api/variables/:nombre  borrar
 *   PUT    /api/variables          reemplazarTodas
 *   POST   /api/consultas/:nombre  corre la consulta guardada de esa variable con los parámetros
 *                                  del cuerpo ({ parametros: { Nombre: Valor } }) → { valor },
 *                                  o { tabla } si la variable es de tipo tabla; en la conexión
 *                                  que dice la variable, o en la de por defecto
 *
 * El SQL de una consulta es siempre el guardado: por la API no se puede mandar SQL para correr.
 * Solo la API: los frontends los sirve otro (Vite en desarrollo, el IIS en el servidor de prueba).
 */
export function crearApp(repo: RepositorioVariables, ejecutar?: EjecutarSql, version?: InfoVersion, conexiones: string[] = []) {

  // punto de entrada de la API, no del servidor de prueba
  const app = express()

  // El JSON de las variables no es muy grande, pero el de una consulta sí: 1 MB. Más grande da 413.
  app.use(express.json({ limit: '1mb' }))

  // no cachear nada
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  // qué versión corre, para confirmar qué quedó publicado (sin version, 404)
  app.get('/api/version', (_req, res) => {
    if (version) res.json(version)
    else res.status(404).json({ error: 'Sin datos de la versión' })
  })

  // las conexiones de las consultas, solo por nombre (nunca host ni usuario): la primera es la de
  // por defecto. Para elegir una en la variable.
  app.get('/api/conexiones', (_req, res) => {
    res.json({ conexiones, porDefecto: conexiones[0] ?? null })
  })

  // API de variables, con el mismo formato que la interfaz RepositorioVariables
  app.get('/api/variables', async (_req, res) => {
    res.json(await repo.listar())
  })

  // variable que llega en el cuerpo debe ser válida y tener el mismo nombre que la ruta
  // (sin distinguir mayúsculas). Si no, 400. Si sí, la guarda (agrega o reemplaza) y responde 204.
  app.put('/api/variables/:nombre', async (req, res) => {
    const variable: unknown = req.body
    if (!esValida(variable) || variable.nombre.toLowerCase() !== req.params.nombre.toLowerCase()) {
      res.status(400).json({ error: 'Se esperaba una variable válida con el mismo nombre que la ruta' })
      return
    }
    await repo.guardar(variable)
    res.status(204).end()
  })

  // borra la variable con ese nombre (sin distinguir mayúsculas). Si no existe, 204 igual.
  app.delete('/api/variables/:nombre', async (req, res) => {
    await repo.borrar(req.params.nombre)
    res.status(204).end()
  })

  // reemplaza todas las variables con la lista del cuerpo. Si hay nombres repetidos
  // (sin distinguir mayúsculas), 400. Si no, las reemplaza y responde 204.
  app.put('/api/variables', async (req, res) => {
    const lista: unknown = req.body
    if (!Array.isArray(lista) || !lista.every(esValida)) {
      res.status(400).json({ error: 'Se esperaba una lista de variables válidas' })
      return
    }
    const nombres = new Set(lista.map((v) => v.nombre.toLowerCase()))
    if (nombres.size !== lista.length) {
      res.status(400).json({ error: 'Hay nombres repetidos (sin distinguir mayúsculas)' })
      return
    }
    await repo.reemplazarTodas(lista)
    res.status(204).end()
  })

  // corre la consulta guardada de la variable con ese nombre, con los parámetros del cuerpo
  // ({ parametros: { Nombre: Valor } }) → { valor }, o { tabla } si la variable es de tipo tabla.
  app.post('/api/consultas/:nombre', async (req, res) => {
    const nombre = req.params.nombre.toLowerCase()
    const variable = (await repo.listar()).find((v) => v.nombre.toLowerCase() === nombre)
    if (variable?.origen.clase !== 'consulta') {
      res.status(404).json({ error: 'No hay una variable de consulta guardada con ese nombre' })
      return
    }
    const preparada = prepararSql(variable.origen.sql)
    if (!preparada.ok) {
      res.status(422).json({ error: preparada.mensaje, codigo: '#¡VALOR!' })
      return
    }
    // Los parámetros, del cuerpo: solo los que nombra el SQL, sin distinguir mayúsculas.
    const recibidos = new Map(Object.entries((req.body as { parametros?: unknown } | undefined)?.parametros ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    const parametros: Record<string, Valor> = {}
    for (const { nombre: p } of parametrosConsulta(preparada.sql)) {
      const v = recibidos.get(p.toLowerCase())
      if (!esValor(v)) {
        res.status(400).json({ error: `Falta el parámetro ${p}, o no es un valor` })
        return
      }
      parametros[p] = v
    }
    if (!ejecutar) {
      res.status(503).json({ error: 'El servidor no tiene base para consultas' })
      return
    }
    // Una conexión que este servidor no tiene (la variable vino de otro, o se sacó del .env) se
    // muestra como error de la consulta, para que se vea en la variable.
    const pedida = variable.origen.conexion?.toLowerCase()
    if (pedida && !conexiones.includes(pedida)) {
      const hay = conexiones.length ? `: hay ${conexiones.join(', ')}` : ''
      res.status(422).json({ error: `La conexión ${variable.origen.conexion} no está configurada en el servidor${hay}`, codigo: '#¡VALOR!' })
      return
    }
    const conexion = pedida ?? conexiones[0]
    try {
      const r = await ejecutar(preparada.sql, parametros, { tabla: variable.tipo === 'tabla', ...(conexion ? { conexion } : {}) })
      res.json('columnas' in r ? { tabla: r } : { valor: r })
    } catch (e) {
      // a diferencia de los otros errores, este se muestra: es el del SQL que escribió el usuario
      // (ORA-00942, ORA-01722…) y sin él no hay forma de corregirlo.
      console.error(`Consulta ${variable.nombre}:`, e)
      const codigo = e instanceof ErrorConsulta ? e.codigo : '#¡VALOR!'
      res.status(422).json({ error: (e instanceof Error ? e.message : String(e)).split('\n')[0], codigo })
    }
  })

  // manejo de errores: loguea y responde 500, o el status que tenga el error
  // (400 de JSON roto, 413 de muy grande)
  const alFallar: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err)
    if (res.headersSent) return
    const status = typeof err?.status === 'number' ? err.status : 500 // 400 de JSON roto, 413 de muy grande
    res.status(status).json({ error: status === 500 ? 'Error interno del servidor' : String(err.message) })
  }
  app.use(alFallar)

  return app
}

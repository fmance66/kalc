# kalc-frontend: la aplicación de Kalc

La aplicación en Vue 3 + PrimeVue que usa [Kalc](../kalc) (el motor de fórmulas tipo Excel)
instalado desde el `.tgz`: Probador, Variables, Funciones y Ayuda. Las variables se guardan en
Oracle a través de `kalc-backend` (con `VITE_API`) o en el `localStorage` del navegador.

> Hasta el 14/10/2026 esto era la demo de `kalc` (`frontend/`), y había otra app mínima de una
> sola página, `kalc-demo`. Se fusionaron acá (14/10/2026): la base es la demo de `kalc`; de
> `kalc-demo` quedaron el orden de la tabla por nombre/tipo, el total de variables y guardar de a
> una variable al renombrar (`guardarCambios` en `catalogo.ts`).

## Las tres partes

Es una de las tres partes de Kalc (`kalc`, `kalc-backend` y `kalc-frontend`), cada una en su
carpeta del repositorio. La arquitectura, cómo se relacionan y cómo instalar y levantar todo
están en el README general, `../README.md`.

Lo de esta carpeta: Kalc solo por el `.tgz` (`import … from 'kalc'`, nunca de sus
archivos) y `kalc-backend` solo por HTTP (`/api/…`).

## Stack

- Vue 3.5 + PrimeVue 4 (tema Aura de `@primeuix/themes` 2, íconos de `primeicons` 7) + Vite 8 +
  TypeScript ~6 + Vitest 5 con happy-dom.
- **No pasar a PrimeVue 5, `@primeuix/themes` 3 ni `primeicons` 8**: cambiaron a la "PrimeUI
  License", que pide una clave y sin ella muestra el cartel "Invalid PrimeUI License". Las versiones
  fijadas en `package.json` (`^4.5.5`, `^2.0.3`, `^7.0.0`) son MIT.
- Instalar con `npm install`.
- Puerto **7200**, `strictPort: true`. `base: './'` para publicar en una subcarpeta del servidor;
  `npm run publicar` la fija en `/kalc/`.
- `main.ts`: carga las variables (`cargarVariables`) y después
  `createApp(App).use(PrimeVue, { theme: { preset: Aura, … } }).mount('#app')`. Siempre en modo
  claro (`darkModeSelector: false`): los colores propios de `estilos.css` son para fondo claro.
- Versiones: `npm version patch|minor|major`. El pie muestra `vX`, y en el build además commit y
  fecha (`vite.config.ts` los pasa como `VITE_VERSION*`). `VITE_REPOSITORIO` sale de `repository`
  en `package.json`: el enlace del pie y de la Ayuda (sin él, no aparece).

### PrimeVue

- Los componentes se importan en cada archivo (`import Button from 'primevue/button'`), no se
  registran globales.
- Botones, campos (`InputText`, `Textarea`), avisos (`Message`), etiquetas (`Tag`), el diálogo
  (`Dialog`) y la barra (`Toolbar`) son de PrimeVue. Los `select` de la tabla de variables son
  nativos, con la clase `campo-select` (los tests les hacen `setValue`).
- Las solapas son botones propios (`.solapas .nav-link`): cada página se monta solo mientras está
  abierta.
- Las pocas utilidades que usan las plantillas (`mb-0`, `small`, `text-danger`…) y las tablas
  (`.tabla`) están en `estilos.css`: no hay Bootstrap.

## Estructura

```
src/
  main.ts, App.vue, estilos.css, env.d.ts
  catalogo.ts         el catálogo de Kalc (shallowRef + triggerRef), compartido por Probador y Variables
  tipos.ts            TIPOS: los tipos de variable, como se muestran (fila y orden de la tabla)
  conexiones.ts       las conexiones de kalc-backend (GET /api/conexiones): con más de una, la fila de una consulta elige en cuál corre
  persistencia/       RepositorioVariables en localStorage (clave kalc:variables) y contra la API (VITE_API)
  components/         ArbolFormula, FilaVariable (fila editable), CampoBorrable, VistaTabla, BotonSubir (volver arriba), Vacio, EnlaceRepositorio
  paginas/            Probador, Variables, Funciones, Ayuda (en ese orden; abre en Probador)
  pruebas/montar.ts   montaje para tests de UI: PrimeVue sin tema y Dialog reemplazado por un stub
  pruebas/variablesIniciales.ts  variables de ejemplo (la app pregunta si cargarlas si no hay ninguna)
  pruebas/variablesPostgres.ts   las de los ejemplos con PostgreSQL (conexión local): la Ayuda las muestra y ofrece agregarlas solo si kalc-backend la tiene
public/               icono.svg, web.config (reenvía /kalc/api/ a kalc-backend en el 8082)
ejemplos/             variables exportadas (variablesIniciales.json se regenera al cambiar las iniciales)
paquetes/             kalc-X.Y.Z.tgz, commiteado
scripts/dev.mjs       npm start: kalc-backend (de ../kalc-backend o KALC_BACKEND_DIR, si no está ya en el 7201) y Vite
scripts/publicar.mjs  npm run publicar: estáticos a la carpeta del IIS (KALC_DESTINO, sin valor por defecto)
```

## Páginas

1. **Probador**: fórmula (se calcula con Enter o Calcular), resultado con su tipo, errores de
   sintaxis subrayados y el AST en árbol (resalta el tramo de cada nodo). Usa las variables
   cargadas y `Causas`, la tabla de ejemplo (`CONTEXTO_EJEMPLOS`). Al escribir `[` se despliegan
   las variables, o las columnas si va pegado a una tabla (`autocompletado.ts`); con Ctrl+Espacio,
   las variables para el nombre a medio escribir sin corchetes (los nombres simples van sin ellos). "Probar" muestra
   el historial de lo calculado (`historial.ts`, `localStorage` clave `kalc:historial`) y, sin
   historial, los ejemplos; los que usan variables solo aparecen si están cargadas.
2. **Variables**: tabla editable (nombre, descripción, tipo, clase, valor o fórmula, resultado,
   estado), con búsqueda, orden por Nombre/Tipo y total en el pie. Edición en línea, recálculo al
   instante, importar/exportar JSON. Una de tipo tabla muestra su tamaño y se despliega.
3. **Funciones**: catálogo generado con `listarFunciones`, con el ejemplo evaluado en vivo.
4. **Ayuda**: sintaxis, operadores, consultas, tablas, ejemplos con el juzgado (el SQL sale de las
   variables iniciales; un test controla que coincidan), ejemplos con PostgreSQL (solo si el servidor
   tiene la conexión `local`) y diferencias con Excel.

Ejemplos: datos inventados, del mismo dominio (un juzgado: expedientes, fueros, estados). Las
consultas de ejemplo van contra la base PostgreSQL de ejemplo de kalc-backend (`db/postgres/`:
`juzgado` para las iniciales; `prueba`, `hr` y `scott` para las de PostgreSQL) y se prueban contra
ella antes de agregarlas.

## Persistencia

`catalogo.ts` guarda cada cambio en el repositorio (`RepositorioVariables` de Kalc): `guardar` o
`borrar` de a una; al renombrar, `guardarCambios` compara con una foto de antes y guarda solo lo
que cambió (nunca `reemplazarTodas`, que pisaría cambios de otros en la base). `reemplazarTodas`
queda para importar un JSON, cargar las iniciales y Reintentar después de un guardado fallido.

Errores del repositorio: no se lanzan, quedan en `errorPersistencia` (`cargar` o `guardar`) y la
App muestra un aviso con Reintentar. Después de una carga fallida, Reintentar vuelve a cargar y
nunca guarda. Los errores de validación (nombre repetido) sí se lanzan y los muestra la fila.

kalc-backend corre el SQL guardado, nunca el que manda el navegador: una consulta se guarda antes
de correrla.

## Tests

- Vitest. Lógica: `*.test.ts` al lado del código. UI: `// @vitest-environment happy-dom` + `montar()`.
- El `ECONNREFUSED ...:3000` en la salida de los tests es ruido de happy-dom: no falla nada.
- Nada de lógica nueva sin test.

## Estilo

- Responder en español rioplatense. Nombres de dominio en español; técnicos en inglés solo si no
  hay uno claro en castellano.
- Comentarios cortos que expliquen el **por qué**.

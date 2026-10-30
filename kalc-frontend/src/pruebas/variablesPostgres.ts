import { fechaASerie, type Variable } from 'kalc'

/** La conexión de kalc-backend a la base PostgreSQL de prueba (solo en desarrollo). */
export const CONEXION_POSTGRES = 'local'

const consulta = (sql: string) => ({ clase: 'consulta' as const, sql, conexion: CONEXION_POSTGRES })

/**
 * Las variables de ejemplo de PostgreSQL: consultas a la base de prueba local de kalc-backend
 * (db/postgres/crear.sql: los esquemas prueba, hr y scott) y fórmulas que las usan. No van en las
 * variables iniciales: en el servidor de prueba no hay conexión `local`. La Ayuda las muestra, y
 * ofrece agregarlas, solo si kalc-backend la tiene. IIBB y Total en moneda usan Neto y Total, de
 * las iniciales.
 */
export const VARIABLES_POSTGRES: Variable[] = [
  // prueba: actividades y alícuotas
  { nombre: 'Actividad', tipo: 'texto', origen: { clase: 'constante', valor: { tipo: 'texto', valor: '620100' } }, descripcion: 'Código CLAE de la actividad, parámetro de Alícuota IIBB (PostgreSQL local)' },
  { nombre: 'Actividades', tipo: 'tabla', origen: consulta('select codigo, descripcion, sector, alicuota_iibb, exenta\nfrom actividades\norder by codigo'), descripcion: 'PostgreSQL (prueba): las actividades con su alícuota de ingresos brutos; Exenta es VERDADERO o FALSO' },
  { nombre: 'Alícuota IIBB', tipo: 'numero', origen: consulta('select alicuota_iibb\nfrom actividades\nwhere codigo = :Actividad'), descripcion: 'PostgreSQL (prueba): consulta con parámetro, la alícuota de la Actividad' },
  { nombre: 'IIBB', tipo: 'numero', origen: { clase: 'formula', texto: 'REDONDEAR(Neto * [Alícuota IIBB]; 2)' }, descripcion: 'Ingresos brutos sobre el neto, con la alícuota que sale de PostgreSQL' },
  { nombre: 'Actividades exentas', tipo: 'entero', origen: { clase: 'formula', texto: 'CONTAR.SI(Actividades[Exenta]; VERDADERO)' }, descripcion: 'Cuántas actividades son exentas: CONTAR.SI sobre una columna boolean' },
  // prueba: escala por tramos
  { nombre: 'Base imponible', tipo: 'numero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 2500000 } }, descripcion: 'Base para el Impuesto según escala' },
  { nombre: 'Escala', tipo: 'tabla', origen: consulta('select desde, hasta, fijo, porcentaje\nfrom escala\norder by desde'), descripcion: 'PostgreSQL (prueba): escala por tramos, como la de ganancias (hasta vacío = en adelante)' },
  {
    nombre: 'Impuesto según escala',
    tipo: 'numero',
    origen: { clase: 'formula', texto: 'BUSCARV([Base imponible]; Escala; 3; VERDADERO) + ([Base imponible] - BUSCARV([Base imponible]; Escala; 1; VERDADERO)) * BUSCARV([Base imponible]; Escala; 4; VERDADERO)' },
    descripcion: 'Fijo + excedente por porcentaje del tramo: BUSCARV aproximado sobre la Escala',
  },
  // prueba: cotizaciones, con dos parámetros y una subconsulta
  { nombre: 'Moneda', tipo: 'texto', origen: { clase: 'constante', valor: { tipo: 'texto', valor: 'USD' } }, descripcion: 'USD o EUR, parámetro de Cotización' },
  { nombre: 'Día', tipo: 'fecha', origen: { clase: 'constante', valor: { tipo: 'fecha', valor: fechaASerie({ anio: 2026, mes: 10, dia: 4 }) as number } }, descripcion: 'Fecha de la Cotización (si no es hábil, la del día hábil anterior)' },
  {
    nombre: 'Cotización',
    tipo: 'numero',
    origen: consulta('select vendedor\nfrom cotizaciones\nwhere moneda = :Moneda\n  and fecha = (select max(fecha) from cotizaciones\n               where moneda = :Moneda and fecha <= :Día)'),
    descripcion: 'PostgreSQL (prueba): la cotización vendedor de la Moneda en el Día, con dos parámetros',
  },
  { nombre: 'Total en moneda', tipo: 'numero', origen: { clase: 'formula', texto: 'REDONDEAR(Total / Cotización; 2)' }, descripcion: 'El Total convertido a la Moneda' },
  { nombre: 'Cotizaciones del dólar', tipo: 'tabla', origen: consulta("select fecha, comprador, vendedor\nfrom cotizaciones\nwhere moneda = 'USD'\norder by fecha"), descripcion: 'PostgreSQL (prueba): una fila por día hábil de 2026' },
  { nombre: 'Dólar máximo', tipo: 'numero', origen: { clase: 'formula', texto: 'MAX([Cotizaciones del dólar][Vendedor])' }, descripcion: 'La cotización más alta del año' },
  // prueba: ventas, feriados y productos
  {
    nombre: 'Ventas por sucursal',
    tipo: 'tabla',
    origen: consulta('select s.nombre as sucursal,\n       count(*) as ventas,\n       round(sum(v.cantidad * v.precio * (1 - v.descuento)), 2) as total\nfrom ventas v\njoin sucursales s on s.codigo = v.sucursal\ngroup by s.nombre\norder by total desc'),
    descripcion: 'PostgreSQL (prueba): las 2000 ventas agrupadas en la base; la primera es la que más vendió',
  },
  { nombre: 'Sucursal que más vende', tipo: 'texto', origen: { clase: 'formula', texto: 'INDICE([Ventas por sucursal][Sucursal]; 1)' }, descripcion: 'La primera fila de Ventas por sucursal' },
  { nombre: 'Feriados', tipo: 'tabla', origen: consulta('select fecha, descripcion, inamovible\nfrom feriados\norder by fecha'), descripcion: 'PostgreSQL (prueba): feriados nacionales de 2026' },
  { nombre: 'Próximo feriado', tipo: 'fecha', origen: { clase: 'formula', texto: 'MIN(FILTRAR(Feriados[Fecha]; Feriados[Fecha] >= HOY()))' }, descripcion: 'El primer feriado desde hoy: cambia cada día' },
  { nombre: 'Productos', tipo: 'tabla', origen: consulta('select codigo, nombre, categoria, precio, activo\nfrom productos\norder by codigo'), descripcion: 'PostgreSQL (prueba): productos con precio y si están activos' },
  { nombre: 'Productos inactivos', tipo: 'entero', origen: { clase: 'formula', texto: 'CONTAR.SI(Productos[Activo]; FALSO)' }, descripcion: 'Cuántos productos no están activos' },
  // hr
  { nombre: 'Empleado', tipo: 'entero', origen: { clase: 'constante', valor: { tipo: 'numero', valor: 104 } }, descripcion: 'employee_id de HR, parámetro de Nombre del empleado' },
  { nombre: 'Nombre del empleado', tipo: 'texto', origen: consulta("select first_name || ' ' || last_name\nfrom employees\nwhere employee_id = :Empleado"), descripcion: 'PostgreSQL (hr): el nombre del Empleado' },
  {
    nombre: 'Empleados',
    tipo: 'tabla',
    origen: consulta("select employee_id as id,\n       first_name || ' ' || last_name as nombre,\n       job_id as puesto,\n       salary as sueldo,\n       hire_date as alta,\n       department_id as departamento\nfrom employees\norder by employee_id"),
    descripcion: 'PostgreSQL (hr): los 107 empleados del esquema de ejemplo de Oracle',
  },
  { nombre: 'Sueldo promedio de IT', tipo: 'numero', origen: { clase: 'formula', texto: 'REDONDEAR(PROMEDIO.SI(Empleados[Departamento]; 60; Empleados[Sueldo]); 2)' }, descripcion: 'PROMEDIO.SI sobre la tabla Empleados (departamento 60 = IT)' },
  {
    nombre: 'Empleados por departamento',
    tipo: 'tabla',
    origen: consulta('select department_name as departamento, count(*) as empleados, round(avg(salary), 2) as sueldo_promedio\nfrom emp_details_view\ngroup by department_name\norder by empleados desc'),
    descripcion: 'PostgreSQL (hr): agrupado en la base, sobre la vista emp_details_view',
  },
  { nombre: 'Antigüedad promedio', tipo: 'numero', origen: consulta('select round(avg(current_date - hire_date) / 365.25, 1)::float8\nfrom employees'), descripcion: 'PostgreSQL (hr): años promedio desde el alta; usa :: para convertir (Kalc 1.5.1)' },
  // scott
  { nombre: 'Grados salariales', tipo: 'tabla', origen: consulta('select losal, hisal, grade\nfrom salgrade\norder by losal'), descripcion: 'PostgreSQL (scott): la tabla salgrade de SCOTT/TIGER' },
  { nombre: 'Grado de 1250', tipo: 'entero', origen: { clase: 'formula', texto: 'BUSCARV(1250; [Grados salariales]; 3; VERDADERO)' }, descripcion: 'El grado salarial de un sueldo de 1250 (BUSCARV aproximado): 2' },
]

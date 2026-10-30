-- Tablas para probar Kalc: valores que se buscan por código (actividades, alícuotas), tramos
-- (escala), fechas (cotizaciones, feriados), lógicos (productos) y una tabla grande (ventas).
-- Los datos son de ejemplo: parecidos a los reales, pero no para usarlos en un cálculo de verdad.
-- Lo carga crear.sql.
DROP SCHEMA IF EXISTS prueba CASCADE;
CREATE SCHEMA prueba;
SET search_path = prueba;

-- Las alícuotas de IVA, por código (como en los comprobantes).
CREATE TABLE alicuotas_iva (
  codigo      integer PRIMARY KEY,
  descripcion varchar(20) NOT NULL,
  alicuota    numeric(5, 4) NOT NULL
);

INSERT INTO alicuotas_iva VALUES
  (3, '0 %', 0),
  (4, '10,5 %', 0.105),
  (5, '21 %', 0.21),
  (6, '27 %', 0.27),
  (8, '5 %', 0.05),
  (9, '2,5 %', 0.025);

-- Actividades (códigos del clasificador CLAE), con su alícuota de IVA y de ingresos brutos.
CREATE TABLE actividades (
  codigo        varchar(6) PRIMARY KEY,
  descripcion   varchar(120) NOT NULL,
  sector        varchar(20) NOT NULL,
  codigo_iva    integer NOT NULL REFERENCES alicuotas_iva,
  alicuota_iibb numeric(5, 4) NOT NULL,
  exenta        boolean NOT NULL DEFAULT false
);

INSERT INTO actividades VALUES
  ('011111', 'Cultivo de arroz', 'Primario', 4, 0.01, false),
  ('011211', 'Cultivo de trigo', 'Primario', 4, 0.01, false),
  ('014113', 'Cría de ganado bovino', 'Primario', 4, 0.01, false),
  ('101011', 'Matanza de ganado bovino', 'Industria', 4, 0.015, false),
  ('107121', 'Elaboración de galletitas y bizcochos', 'Industria', 5, 0.015, false),
  ('181109', 'Impresión n.c.p.', 'Industria', 5, 0.015, false),
  ('410011', 'Construcción de edificios residenciales', 'Construcción', 4, 0.025, false),
  ('471110', 'Venta al por menor en hipermercados', 'Comercio', 5, 0.035, false),
  ('472130', 'Venta al por menor de carnes rojas', 'Comercio', 4, 0.03, false),
  ('477311', 'Venta al por menor de productos farmacéuticos', 'Comercio', 5, 0.03, false),
  ('492110', 'Transporte urbano de pasajeros', 'Servicios', 4, 0.02, false),
  ('561011', 'Servicios de restaurantes y cantinas sin espectáculo', 'Servicios', 5, 0.04, false),
  ('620100', 'Servicios de consultores en informática y suministros de programas', 'Servicios', 5, 0.035, false),
  ('641910', 'Servicios de la banca mayorista', 'Financiero', 5, 0.07, false),
  ('681098', 'Servicios inmobiliarios realizados por cuenta propia, con bienes urbanos propios o arrendados n.c.p.', 'Servicios', 5, 0.05, false),
  ('691001', 'Servicios jurídicos', 'Servicios', 5, 0.04, false),
  ('692000', 'Servicios de contabilidad, auditoría y asesoría fiscal', 'Servicios', 5, 0.04, false),
  ('851010', 'Enseñanza inicial', 'Servicios', 3, 0, true),
  ('862110', 'Servicios de consulta médica', 'Servicios', 3, 0, true),
  ('910100', 'Servicios de bibliotecas y archivos', 'Servicios', 3, 0, true);

-- Una escala por tramos, como la del impuesto a las ganancias: el impuesto de una base es
-- fijo + (base - desde) * porcentaje, en el tramo en el que cae. hasta NULL es "en adelante".
CREATE TABLE escala (
  tramo      integer PRIMARY KEY,
  desde      numeric(14, 2) NOT NULL,
  hasta      numeric(14, 2),
  fijo       numeric(14, 2) NOT NULL,
  porcentaje numeric(5, 4) NOT NULL
);

INSERT INTO escala VALUES
  (1, 0, 1000000, 0, 0.05),
  (2, 1000000, 2000000, 50000, 0.09),
  (3, 2000000, 3000000, 140000, 0.12),
  (4, 3000000, 4500000, 260000, 0.15),
  (5, 4500000, 9000000, 485000, 0.19),
  (6, 9000000, 13500000, 1340000, 0.23),
  (7, 13500000, 20250000, 2375000, 0.27),
  (8, 20250000, 30375000, 4197500, 0.31),
  (9, 30375000, NULL, 7336250, 0.35);

-- Feriados nacionales de 2026 (para días hábiles).
CREATE TABLE feriados (
  fecha       date PRIMARY KEY,
  descripcion varchar(60) NOT NULL,
  inamovible  boolean NOT NULL
);

INSERT INTO feriados VALUES
  ('2026-01-01', 'Año nuevo', true),
  ('2026-02-16', 'Carnaval', true),
  ('2026-02-17', 'Carnaval', true),
  ('2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', true),
  ('2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', true),
  ('2026-04-03', 'Viernes Santo', true),
  ('2026-05-01', 'Día del Trabajador', true),
  ('2026-05-25', 'Día de la Revolución de Mayo', true),
  ('2026-06-15', 'Paso a la Inmortalidad del General Martín Miguel de Güemes', false),
  ('2026-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', true),
  ('2026-07-09', 'Día de la Independencia', true),
  ('2026-08-17', 'Paso a la Inmortalidad del General José de San Martín', false),
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural', false),
  ('2026-11-23', 'Día de la Soberanía Nacional', false),
  ('2026-12-08', 'Inmaculada Concepción de María', true),
  ('2026-12-25', 'Navidad', true);

-- Cotizaciones diarias (días hábiles de 2026, hasta hoy) del dólar y del euro. Inventadas, pero
-- siempre las mismas: salen de una fórmula, no de random().
CREATE TABLE cotizaciones (
  fecha     date NOT NULL,
  moneda    char(3) NOT NULL,
  comprador numeric(10, 2) NOT NULL,
  vendedor  numeric(10, 2) NOT NULL,
  PRIMARY KEY (fecha, moneda)
);

INSERT INTO cotizaciones
SELECT d::date, m.moneda,
       round((m.base + (d::date - date '2026-01-01') * m.pendiente + 15 * sin((d::date - date '2026-01-01') / 9.0))::numeric, 2),
       round((m.base + (d::date - date '2026-01-01') * m.pendiente + 15 * sin((d::date - date '2026-01-01') / 9.0) + m.spread)::numeric, 2)
FROM generate_series(date '2026-01-02', date '2026-10-15', interval '1 day') AS d
CROSS JOIN (VALUES ('USD', 1450.0, 1.1, 40.0), ('EUR', 1690.0, 1.3, 55.0)) AS m (moneda, base, pendiente, spread)
WHERE extract(isodow FROM d) < 6
  AND d::date NOT IN (SELECT fecha FROM feriados);

CREATE TABLE productos (
  codigo     varchar(8) PRIMARY KEY,
  nombre     varchar(60) NOT NULL,
  categoria  varchar(20) NOT NULL,
  precio     numeric(12, 2) NOT NULL,
  codigo_iva integer NOT NULL REFERENCES alicuotas_iva,
  activo     boolean NOT NULL
);

INSERT INTO productos VALUES
  ('ALM-001', 'Yerba mate 1 kg', 'Almacén', 4500, 4, true),
  ('ALM-002', 'Azúcar 1 kg', 'Almacén', 1300, 4, true),
  ('ALM-003', 'Aceite de girasol 1,5 l', 'Almacén', 3800, 5, true),
  ('ALM-004', 'Fideos secos 500 g', 'Almacén', 1600, 4, true),
  ('ALM-005', 'Harina 000 1 kg', 'Almacén', 1100, 4, false),
  ('BEB-001', 'Agua mineral 2 l', 'Bebidas', 1400, 5, true),
  ('BEB-002', 'Gaseosa cola 2,25 l', 'Bebidas', 3300, 5, true),
  ('BEB-003', 'Vino tinto 750 ml', 'Bebidas', 6500, 5, true),
  ('LIM-001', 'Detergente 750 ml', 'Limpieza', 2700, 5, true),
  ('LIM-002', 'Lavandina 2 l', 'Limpieza', 1900, 5, true),
  ('ELE-001', 'Pava eléctrica', 'Electro', 42000, 4, true),
  ('ELE-002', 'Licuadora', 'Electro', 68000, 4, true),
  ('ELE-003', 'Notebook 15"', 'Electro', 950000, 4, false),
  ('SER-001', 'Envío a domicilio', 'Servicios', 3500, 5, true),
  ('SER-002', 'Instalación', 'Servicios', 25000, 6, true);

CREATE TABLE sucursales (
  codigo    integer PRIMARY KEY,
  nombre    varchar(30) NOT NULL,
  provincia varchar(30) NOT NULL
);

INSERT INTO sucursales VALUES
  (1, 'Centro', 'Ciudad de Buenos Aires'),
  (2, 'Belgrano', 'Ciudad de Buenos Aires'),
  (3, 'La Plata', 'Buenos Aires'),
  (4, 'Rosario', 'Santa Fe'),
  (5, 'Córdoba', 'Córdoba'),
  (6, 'Mendoza', 'Mendoza');

-- 2000 ventas de 2026, siempre las mismas: cada columna sale de un hash del número de venta.
CREATE TABLE ventas (
  id          integer PRIMARY KEY,
  fecha       date NOT NULL,
  sucursal    integer NOT NULL REFERENCES sucursales,
  producto    varchar(8) NOT NULL REFERENCES productos,
  cantidad    integer NOT NULL,
  precio      numeric(12, 2) NOT NULL,
  descuento   numeric(4, 2) NOT NULL
);

INSERT INTO ventas
SELECT n,
       date '2026-01-02' + (abs(hashint4(n)::bigint) % 286)::int,
       1 + abs(hashint4(n * 7)::bigint) % 6,
       p.codigo,
       1 + abs(hashint4(n * 13)::bigint) % (CASE WHEN p.categoria = 'Electro' THEN 2 ELSE 12 END),
       p.precio,
       CASE abs(hashint4(n * 17)::bigint) % 10 WHEN 0 THEN 0.10 WHEN 1 THEN 0.05 ELSE 0 END
FROM generate_series(1, 2000) AS n
JOIN (SELECT codigo, categoria, precio, row_number() OVER (ORDER BY codigo) - 1 AS i FROM productos) AS p
  ON p.i = abs(hashint4(n * 3)::bigint) % 15;

CREATE INDEX ventas_fecha_ix ON ventas (fecha);

RESET search_path;

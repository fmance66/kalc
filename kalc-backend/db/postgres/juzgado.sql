-- Un juzgado de ejemplo para las variables iniciales de kalc-frontend: expedientes, con su fuero,
-- jurisdicción, estado de trámite y región. Todo inventado. Lo carga crear.sql.
--
-- Los expedientes salen de un hash de su número (siempre los mismos), pero las fechas de alta son
-- relativas al día en que se carga: así "las altas de los últimos 30 días" siempre da algo.
DROP SCHEMA IF EXISTS juzgado CASCADE;
CREATE SCHEMA juzgado;
SET search_path = juzgado;

CREATE TABLE fueros (
  codigo      integer PRIMARY KEY,
  descripcion varchar(40) NOT NULL
);

INSERT INTO fueros VALUES
  (1, 'Federal'),
  (2, 'Penal Económico'),
  (3, 'Civil y Comercial'),
  (4, 'Laboral');

-- Los estados de trámite: Estado (de las variables iniciales) es uno de estos códigos.
CREATE TABLE estados (
  codigo integer PRIMARY KEY,
  nombre varchar(20) NOT NULL
);

INSERT INTO estados VALUES
  (1, 'Borrador'),
  (2, 'En trámite'),
  (3, 'Finalizado');

CREATE TABLE regiones (
  codigo      integer PRIMARY KEY,
  descripcion varchar(20) NOT NULL
);

INSERT INTO regiones VALUES
  (1, 'Metropolitana'),
  (2, 'Centro'),
  (3, 'Cuyo'),
  (4, 'Noroeste'),
  (5, 'Noreste'),
  (6, 'Patagonia');

-- Las jurisdicciones de cada fuero. baja: dada de baja (no se lista en las consultas).
CREATE TABLE jurisdicciones (
  codigo      integer PRIMARY KEY,
  fuero       integer NOT NULL REFERENCES fueros,
  descripcion varchar(40) NOT NULL,
  region      integer NOT NULL REFERENCES regiones,
  baja        date
);

INSERT INTO jurisdicciones VALUES
  (101, 1, 'Capital', 1, NULL),
  (102, 1, 'San Martín', 1, NULL),
  (103, 1, 'La Plata', 1, NULL),
  (104, 1, 'Rosario', 2, NULL),
  (105, 1, 'Córdoba', 2, NULL),
  (106, 1, 'Mendoza', 3, NULL),
  (107, 1, 'Tucumán', 4, NULL),
  (108, 1, 'Resistencia', 5, NULL),
  (109, 1, 'Comodoro Rivadavia', 6, NULL),
  (110, 1, 'Bahía Blanca', 1, '2025-06-30'),
  (201, 2, 'Capital', 1, NULL),
  (202, 2, 'Rosario', 2, NULL),
  (301, 3, 'Capital', 1, NULL),
  (302, 3, 'Córdoba', 2, NULL),
  (303, 3, 'Mendoza', 3, NULL),
  (304, 3, 'Salta', 4, NULL),
  (305, 3, 'Neuquén', 6, NULL),
  (401, 4, 'Capital', 1, NULL),
  (402, 4, 'Paraná', 5, NULL);

-- 400 expedientes. estado: el código de estados; baja: dado de baja (no está vigente).
CREATE TABLE expedientes (
  id           integer PRIMARY KEY,
  caratula     varchar(80) NOT NULL,
  fuero        integer NOT NULL REFERENCES fueros,
  jurisdiccion integer NOT NULL REFERENCES jurisdicciones,
  region       integer NOT NULL REFERENCES regiones,
  estado       integer NOT NULL REFERENCES estados,
  monto        numeric(14, 2) NOT NULL,
  alta         date NOT NULL,
  baja         date
);

INSERT INTO expedientes
SELECT n,
       (ARRAY['Pérez', 'Gómez', 'López', 'Díaz', 'Ruiz', 'Sosa', 'Romero', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Aguirre'])[1 + abs(hashint4(n * 5)::bigint) % 12]
         || ' c/ '
         || (ARRAY['Transportes del Sur S.A.', 'Estado Nacional', 'Constructora Andina S.R.L.', 'Banco Ejemplo S.A.', 'Agro Pampa S.A.', 'Municipalidad'])[1 + abs(hashint4(n * 11)::bigint) % 6]
         || ' s/ '
         || (ARRAY['daños y perjuicios', 'cobro de pesos', 'amparo', 'despido', 'ejecución fiscal'])[1 + abs(hashint4(n * 19)::bigint) % 5],
       j.fuero,
       j.codigo,
       j.region,
       -- Más en trámite que en los otros: 1 de cada 5 borrador, 3 en trámite, 1 finalizado.
       (ARRAY[1, 2, 2, 2, 3])[1 + abs(hashint4(n * 23)::bigint) % 5],
       round((10000 + abs(hashint4(n * 29)::bigint) % 990000)::numeric, -2),
       current_date - (abs(hashint4(n * 31)::bigint) % 540)::int,
       NULL
FROM generate_series(1, 400) AS n
JOIN (SELECT codigo, fuero, region, row_number() OVER (ORDER BY codigo) - 1 AS i FROM jurisdicciones WHERE baja IS NULL) AS j
  ON j.i = abs(hashint4(n * 3)::bigint) % 18;

-- Uno de cada doce, dado de baja a los 60 días del alta (o hoy, si es más nuevo).
UPDATE expedientes SET baja = least(alta + 60, current_date) WHERE id % 12 = 0;

CREATE INDEX expedientes_alta_ix ON expedientes (alta);

RESET search_path;

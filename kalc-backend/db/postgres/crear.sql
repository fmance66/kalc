-- La base PostgreSQL de Kalc: los usuarios, la base `kalc`, la tabla de variables (el almacén) y
-- los esquemas de ejemplo. Se corre con psql como superusuario (postgres), desde esta carpeta o no:
--
--   psql -h localhost -U postgres -v clave_kalc=<clave> -v clave_lectura=<clave> -f db/postgres/crear.sql
--
-- Se puede volver a correr: los usuarios, la base y la tabla de variables se crean si no están, y
-- cada esquema de ejemplo se borra y se vuelve a cargar (lo que se haya cambiado a mano en hr, scott,
-- prueba o kalc_data se pierde; las variables guardadas, no).
--
--   kalc          dueño de la base y de los esquemas: el del almacén, que guarda las variables
--   kalc_lectura  el de las consultas: solo SELECT en los ejemplos, y sesiones de solo lectura
--
--   kalc    la tabla motor_variables: donde se guardan las variables
--   hr      el clásico esquema de ejemplo HR (empleados, departamentos, puestos...)
--   scott   el clásico SCOTT/TIGER (emp, dept, salgrade, bonus)
--   prueba  tablas para probar Kalc: actividades, alícuotas, escala, cotizaciones, productos, ventas
--   kalc_data el de las variables iniciales de kalc-frontend: expedientes, fueros, estados, jurisdicciones
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';

SELECT format('CREATE ROLE kalc LOGIN PASSWORD %L', :'clave_kalc')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kalc') \gexec
SELECT format('CREATE ROLE kalc_lectura LOGIN PASSWORD %L', :'clave_lectura')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kalc_lectura') \gexec
-- Defensa extra: aunque la API ya abre transacciones de solo lectura.
ALTER ROLE kalc_lectura SET default_transaction_read_only = on;

SELECT 'CREATE DATABASE kalc OWNER kalc ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kalc') \gexec

\connect kalc
SET client_encoding = 'UTF8';
-- Sin los avisos de DROP SCHEMA IF EXISTS la primera vez.
SET client_min_messages = warning;
-- Los objetos quedan de kalc, no de postgres.
SET ROLE kalc;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

\ir variables.sql
\ir hr.sql
\ir scott.sql
\ir prueba.sql
\ir kalc_data.sql

-- kalc_lectura: solo leer los esquemas de ejemplo (las variables guardadas, no).
GRANT CONNECT ON DATABASE kalc TO kalc_lectura;
GRANT USAGE ON SCHEMA hr, scott, prueba, kalc_data TO kalc_lectura;
GRANT SELECT ON ALL TABLES IN SCHEMA hr, scott, prueba, kalc_data TO kalc_lectura;

-- Lo que quedó cargado.
SELECT table_schema AS esquema, table_name AS tabla, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS filas
FROM information_schema.tables
WHERE table_schema IN ('kalc', 'hr', 'scott', 'prueba', 'kalc_data')
ORDER BY 1, 2;

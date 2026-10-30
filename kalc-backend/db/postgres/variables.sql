-- La tabla de variables de Kalc: el almacén, en el esquema kalc. Lo carga crear.sql, y se puede
-- correr solo en cualquier PostgreSQL, con un usuario que pueda crear esquemas.
--
-- A diferencia de los esquemas de ejemplo, no se borra al volver a correrlo: acá están las
-- variables guardadas.
CREATE SCHEMA IF NOT EXISTS kalc;

CREATE TABLE IF NOT EXISTS kalc.motor_variables (
  -- Da el orden de listado: el orden en que se agregaron (guardar una existente no la mueve).
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre      varchar(255) NOT NULL,
  tipo        varchar(10) NOT NULL
              CONSTRAINT motor_variables_tipo_ck CHECK (tipo IN ('numero', 'entero', 'texto', 'logico', 'fecha', 'tabla')),
  -- { clase: 'constante', valor: Valor } | { clase: 'formula', texto } | { clase: 'consulta', sql }
  -- | { clase: 'datos', tabla }, en JSON. En text y no en jsonb: el servidor valida cada variable
  -- al leerla (una fila rota se ignora), y así vuelve con las claves en el orden en que se guardó.
  origen      text NOT NULL,
  -- De una tabla, las columnas calculadas: [{ nombre, formula }], en JSON (o NULL).
  columnas    text,
  descripcion text,
  modificado  timestamptz NOT NULL DEFAULT now()
);

-- El motor no distingue mayúsculas: Alicuota y ALICUOTA son la misma variable.
CREATE UNIQUE INDEX IF NOT EXISTS motor_variables_nombre_uk ON kalc.motor_variables (upper(nombre));

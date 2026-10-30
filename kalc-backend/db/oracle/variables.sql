-- Tabla de variables de Kalc, el motor de fórmulas (Oracle 11g o posterior).
-- Correr una vez en el esquema, con un usuario que pueda crear tablas, secuencias e índices.
-- El id sale de una secuencia con un trigger, y el JSON no se controla con IS JSON (el servidor
-- valida cada variable al leerla: una fila rota se ignora): así anda también en bases con el
-- parámetro COMPATIBLE en 11 (aunque sean Oracle 18c), que no aceptan IDENTITY ni IS JSON.

CREATE SEQUENCE motor_variables_sq;

CREATE TABLE motor_variables (
  -- Da el orden de listado: el orden en que se agregaron (guardar una existente no la mueve).
  id          NUMBER CONSTRAINT motor_variables_pk PRIMARY KEY,
  nombre      VARCHAR2(255 CHAR) NOT NULL,
  tipo        VARCHAR2(10) NOT NULL
              CONSTRAINT motor_variables_tipo_ck CHECK (tipo IN ('numero', 'entero', 'texto', 'logico', 'fecha', 'tabla')),
  -- { clase: 'constante', valor: Valor } | { clase: 'formula', texto } | { clase: 'consulta', sql }
  -- | { clase: 'datos', tabla }, en JSON.
  origen      CLOB NOT NULL,
  -- De una tabla, las columnas calculadas: [{ nombre, formula }], en JSON (o NULL).
  columnas    CLOB,
  descripcion VARCHAR2(4000 CHAR),
  modificado  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE OR REPLACE TRIGGER motor_variables_id
BEFORE INSERT ON motor_variables
FOR EACH ROW
BEGIN
  :new.id := motor_variables_sq.NEXTVAL;
END;
/

-- El motor no distingue mayúsculas: Alicuota y ALICUOTA son la misma variable.
CREATE UNIQUE INDEX motor_variables_nombre_uk ON motor_variables (UPPER(nombre));

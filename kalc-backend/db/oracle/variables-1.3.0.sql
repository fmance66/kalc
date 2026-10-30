-- Migración a la 1.3.0: las columnas calculadas de las tablas, en JSON.
-- Correr una vez en las bases creadas con un variables.sql anterior, ANTES de publicar la 1.3.0:
-- sin esta columna, el servidor no puede listar las variables (ORA-00904).

ALTER TABLE motor_variables ADD (columnas CLOB);

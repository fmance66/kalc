-- Migración a la 1.2.0: el tipo 'tabla' (consultas que traen todas sus filas).
-- Correr una vez en las bases creadas con un variables.sql anterior: sin esto, guardar una variable
-- de tipo tabla falla con ORA-02290 (check constraint violated).

ALTER TABLE motor_variables DROP CONSTRAINT motor_variables_tipo_ck;
ALTER TABLE motor_variables ADD CONSTRAINT motor_variables_tipo_ck
  CHECK (tipo IN ('numero', 'entero', 'texto', 'logico', 'fecha', 'tabla'));

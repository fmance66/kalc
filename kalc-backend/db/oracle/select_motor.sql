select id, nombre, tipo, dbms_lob.substr(origen, 2000, 1) as origen,
       descripcion, dbms_lob.substr(columnas, 2000, 1) as columnas
from motor_variables
--where dbms_lob.instr(origen, '"clase":"consulta"') > 0
order by id;

# Funciones

<!-- Generado por scripts/generar-funciones.mjs desde el registro (npm run build:lib). No editar a mano. -->

Las 86 funciones que trae Kalc. Se escriben con el nombre de Excel en castellano o en inglés
(los alias), sin distinguir mayúsculas, y los argumentos se separan con `;`. En la firma, los argumentos entre
corchetes son opcionales. Las marcadas _propia de Kalc_ no existen en Excel: su descripción dice cómo se
escribe lo mismo allá. Para agregar funciones propias de una aplicación, ver `registrarFuncion` en el [README](../README.md).

Los resultados se calcularon con la librería. Los ejemplos de tablas usan esta, `CONTEXTO_EJEMPLOS` en la API:

**Causas**

| Causa | Fuero | Monto | Fojas |
| --- | --- | --- | --- |
| Pérez | Federal | 320000 | 40 |
| Gómez | Federal | 850000 | 12 |
| López | Penal Económico | 150000 | 60 |
| Díaz | Penal Económico | 980000 | 8 |
| Ruiz | Criminal | 210000 |  |
| Sosa | Criminal | 450000 | 25 |

## Índice

- [Lógicas](#lógicas)
- [Matemáticas](#matemáticas)
- [Estadísticas](#estadísticas)
- [Búsqueda](#búsqueda)
- [Matrices](#matrices)
- [Texto](#texto)
- [Fechas](#fechas)
- [Información](#información)

## Lógicas

| Función | Qué hace | Ejemplo | Resultado |
| --- | --- | --- | --- |
| `SI(condición; [si_verdadero]; [si_falso])`<br>_alias: IF_ | Si la condición se cumple devuelve el segundo argumento; si no, el tercero (o FALSO si falta). Solo evalúa el que corresponde. | `SI(1>2; "mayor"; "menor o igual")` | `menor o igual` |
| `Y(lógico1; [lógico2]; …)`<br>_alias: AND_ | VERDADERO si todos los argumentos son verdaderos. Evalúa todos (no hace cortocircuito). | `Y(2>1; "a"="A")` | `VERDADERO` |
| `O(lógico1; [lógico2]; …)`<br>_alias: OR_ | VERDADERO si alguno de los argumentos es verdadero. Evalúa todos (no hace cortocircuito). | `O(1>2; 0; VERDADERO)` | `VERDADERO` |
| `NO(lógico)`<br>_alias: NOT_ | Invierte el valor lógico: un número distinto de 0 cuenta como VERDADERO. | `NO(0)` | `VERDADERO` |
| `SI.ERROR(valor; si_error)`<br>_alias: IFERROR_ | El valor, o el segundo argumento si el valor es un error (cualquiera). El segundo solo se evalúa si hace falta. | `SI.ERROR(1/0; "sin dato")` | `sin dato` |
| `SI.CONJUNTO(condición1; valor1; [condición2; valor2]; …)`<br>_alias: IFS_ | El valor de la primera condición que se cumple; #N/D si no se cumple ninguna. Para un "si no", poner VERDADERO como última condición. | `SI.CONJUNTO(5<3; "chico"; 5<10; "mediano"; VERDADERO; "grande")` | `mediano` |
| `CAMBIAR(expresión; valor1; resultado1; [valor2; resultado2]; …; [si_no])`<br>_alias: SWITCH_ | Compara la expresión con cada valor y devuelve el resultado del primero igual; si ninguno coincide, el último argumento sobrante o #N/D. | `CAMBIAR(2; 1; "uno"; 2; "dos"; "otro")` | `dos` |
| `VERDADERO()`<br>_alias: TRUE_ | El valor lógico VERDADERO (también se puede escribir sin paréntesis). | `VERDADERO()` | `VERDADERO` |
| `FALSO()`<br>_alias: FALSE_ | El valor lógico FALSO (también se puede escribir sin paréntesis). | `FALSO()` | `FALSO` |

## Matemáticas

| Función | Qué hace | Ejemplo | Resultado |
| --- | --- | --- | --- |
| `SUMA(número1; [número2]; …)`<br>_alias: SUM_ | La suma de los argumentos. De una variable solo cuentan números y fechas; escrito directo, "3" y VERDADERO se convierten. | `SUMA(1; 2,5; "3"; VERDADERO)` | `7,5` |
| `PROMEDIO(número1; [número2]; …)`<br>_alias: AVERAGE_ | El promedio de los números (con las mismas reglas que SUMA). Sin ningún número, #¡DIV/0!. | `PROMEDIO(2; 4; 9)` | `5` |
| `MIN(número1; [número2]; …)` | El menor de los números; 0 si no hay ninguno. | `MIN(5; -2; 8)` | `-2` |
| `MAX(número1; [número2]; …)` | El mayor de los números; 0 si no hay ninguno. | `MAX(5; -2; 8)` | `8` |
| `REDONDEAR(número; decimales)`<br>_alias: ROUND_ | Redondea a esa cantidad de decimales (negativa: a decenas, centenas…). La mitad se aleja del cero: -2,5 da -3. | `REDONDEAR(2,675; 2)` | `2,68` |
| `REDONDEAR.MAS(número; decimales)`<br>_alias: ROUNDUP_ | Redondea alejándose del cero. | `REDONDEAR.MAS(-3,141; 1)` | `-3,2` |
| `REDONDEAR.MENOS(número; decimales)`<br>_alias: ROUNDDOWN_ | Redondea acercándose al cero (corta los decimales). | `REDONDEAR.MENOS(-3,149; 1)` | `-3,1` |
| `TRUNCAR(número; [decimales])`<br>_alias: TRUNC_ | Corta los decimales sin redondear (por defecto, todos). | `TRUNCAR(-8,9)` | `-8` |
| `ENTERO(número)`<br>_alias: INT_ | Redondea hacia abajo al entero: con negativos no es lo mismo que TRUNCAR (ENTERO(-8,9) = -9). | `ENTERO(-8,9)` | `-9` |
| `ABS(número)` | El valor absoluto (sin signo). | `ABS(-12,5)` | `12,5` |
| `RESIDUO(número; divisor)`<br>_alias: MOD_ | El resto de la división. Tiene el signo del divisor: RESIDUO(-3; 2) = 1. | `RESIDUO(-3; 2)` | `1` |
| `POTENCIA(número; potencia)`<br>_alias: POWER_ | Lo mismo que el operador ^. | `POTENCIA(2; 10)` | `1024` |
| `RAIZ(número)`<br>_alias: SQRT_ | La raíz cuadrada. De un negativo, #¡NUM!. | `RAIZ(16)` | `4` |
| `EXP(número)` | e (2,71828…) elevado al número. Si el resultado es demasiado grande, #¡NUM!. | `EXP(1)` | `2,71828182845905` |
| `LN(número)` | El logaritmo natural (en base e). De cero o un negativo, #¡NUM!. | `LN(EXP(2))` | `2` |
| `LOG10(número)` | El logaritmo en base 10. De cero o un negativo, #¡NUM!. | `LOG10(1000)` | `3` |
| `LOG(número; [base])` | El logaritmo en esa base (por defecto, 10). Con base 1, #¡DIV/0!; con número o base de cero o menos, #¡NUM!. | `LOG(8; 2)` | `3` |
| `PI()` | El número π (3,14159265358979). | `PI()` | `3,14159265358979` |
| `RADIANES(grados)`<br>_alias: RADIANS_ | Pasa de grados a radianes, que es lo que usan SENO, COS y TAN. | `RADIANES(180)` | `3,14159265358979` |
| `GRADOS(radianes)`<br>_alias: DEGREES_ | Pasa de radianes a grados. | `GRADOS(PI())` | `180` |
| `SENO(radianes)`<br>_alias: SIN_ | El seno de un ángulo en radianes (en grados: SENO(RADIANES(30))). | `SENO(RADIANES(30))` | `0,5` |
| `COS(radianes)` | El coseno de un ángulo en radianes. | `COS(PI())` | `-1` |
| `TAN(radianes)` | La tangente de un ángulo en radianes. | `TAN(RADIANES(45))` | `1` |
| `ASENO(número)`<br>_alias: ASIN_ | El arco seno, en radianes (entre -π/2 y π/2). Fuera de -1 a 1, #¡NUM!. | `GRADOS(ASENO(0,5))` | `30` |
| `ACOS(número)` | El arco coseno, en radianes (entre 0 y π). Fuera de -1 a 1, #¡NUM!. | `ACOS(-1)` | `3,14159265358979` |
| `ATAN(número)` | El arco tangente, en radianes (entre -π/2 y π/2). | `GRADOS(ATAN(1))` | `45` |
| `ATAN2(x; y)` | El ángulo del punto (x; y), en radianes (entre -π y π). Primero va x, al revés que en otros lenguajes. En (0; 0), #¡DIV/0!. | `GRADOS(ATAN2(-1; 1))` | `135` |
| `SENOH(número)`<br>_alias: SINH_ | El seno hiperbólico. | `SENOH(1)` | `1,1752011936438` |
| `COSH(número)` | El coseno hiperbólico. | `COSH(1)` | `1,54308063481524` |
| `TANH(número)` | La tangente hiperbólica. | `TANH(1)` | `0,761594155955765` |
| `ASENOH(número)`<br>_alias: ASINH_ | La inversa del seno hiperbólico. | `ASENOH(1)` | `0,881373587019543` |
| `ACOSH(número)` | La inversa del coseno hiperbólico. Menor que 1, #¡NUM!. | `ACOSH(10)` | `2,99322284612638` |
| `ATANH(número)` | La inversa de la tangente hiperbólica. Fuera de -1 a 1 (sin incluirlos), #¡NUM!. | `ATANH(0,5)` | `0,549306144334055` |

## Estadísticas

| Función | Qué hace | Ejemplo | Resultado |
| --- | --- | --- | --- |
| `CONTAR(valor1; [valor2]; …)`<br>_alias: COUNT_ | Cuántos números hay. De una tabla, columna o variable cuentan solo los números y las fechas; escrito directo, también "3" y VERDADERO. Los errores no se cuentan. | `CONTAR(Causas[Fojas])` | `5` |
| `CONTARA(valor1; [valor2]; …)`<br>_alias: COUNTA_ | Cuántos valores no vacíos hay (números, textos, lógicos y errores). | `CONTARA(Causas[Causa])` | `6` |
| `CONTAR.BLANCO(rango)`<br>_alias: COUNTBLANK_ | Cuántas celdas vacías hay en el rango (también las de texto vacío). | `CONTAR.BLANCO(Causas[Fojas])` | `1` |
| `CONTAR.SI(rango; criterio)`<br>_alias: COUNTIF_ | Cuántas celdas del rango cumplen el criterio: un valor, o un texto con operador (">100", "<>Baja") o comodines ("A*"). | `CONTAR.SI(Causas[Fuero]; "Criminal")` | `2` |
| `CONTAR.SI.CONJUNTO(rango1; criterio1; [rango2; criterio2]; …)`<br>_alias: COUNTIFS_ | Cuántas filas cumplen todos los criterios, cada uno en su rango. Los rangos tienen que ser del mismo tamaño. | `CONTAR.SI.CONJUNTO(Causas[Fuero]; "Federal"; Causas[Monto]; ">500000")` | `1` |
| `SUMAR.SI(rango; criterio; [rango_suma])`<br>_alias: SUMIF_ | Suma las celdas de rango_suma (o del rango, si falta) en las filas donde el rango cumple el criterio. | `SUMAR.SI(Causas[Fuero]; "Criminal"; Causas[Monto])` | `660000` |
| `SUMAR.SI.CONJUNTO(rango_suma; rango1; criterio1; [rango2; criterio2]; …)`<br>_alias: SUMIFS_ | Suma las celdas de rango_suma en las filas que cumplen todos los criterios. Todos los rangos, del mismo tamaño. | `SUMAR.SI.CONJUNTO(Causas[Fojas]; Causas[Monto]; "<500000"; Causas[Fuero]; "<>Penal Económico")` | `65` |
| `PROMEDIO.SI(rango; criterio; [rango_promedio])`<br>_alias: AVERAGEIF_ | El promedio de las celdas de rango_promedio (o del rango) en las filas que cumplen el criterio. Sin ninguna, #¡DIV/0!. | `PROMEDIO.SI(Causas[Fuero]; "P*"; Causas[Monto])` | `565000` |

## Búsqueda

| Función | Qué hace | Ejemplo | Resultado |
| --- | --- | --- | --- |
| `BUSCARV(valor; tabla; columna; [ordenado])`<br>_alias: VLOOKUP_ | Busca el valor en la primera columna de la tabla y devuelve el de esa fila en la columna indicada (desde 1). Con ordenado FALSO busca el igual (admite comodines); si falta o es VERDADERO, el mayor que no se pase (la tabla tiene que estar ordenada). | `BUSCARV("Gómez"; Causas; 3; FALSO)` | `850000` |
| `BUSCARX(valor; rango_búsqueda; rango_resultado; [si_no_está])`<br>_alias: XLOOKUP_ | Busca el valor (igual, con comodines) en una columna y devuelve el de la misma fila en otra. Si no está, si_no_está (o #N/D). Solo la búsqueda exacta: sin los modos de Excel. | `BUSCARX("López"; Causas[Causa]; Causas[Fojas]; "No está")` | `60` |
| `COINCIDIR(valor; rango; [tipo])`<br>_alias: MATCH_ | La posición del valor en una columna (o fila), desde 1. Tipo 0: el igual (con comodines); 1 (si falta): el mayor que no se pase, con los datos en orden ascendente; -1: el menor que no baje, en orden descendente. | `COINCIDIR("Ruiz"; Causas[Causa]; 0)` | `5` |
| `INDICE(rango; fila; [columna])`<br>_alias: INDEX_ | El valor de esa fila y columna del rango (desde 1). En una sola columna (o fila) alcanza con la posición. | `INDICE(Causas; 4; 1)` | `Díaz` |
| `FILAS(rango)`<br>_alias: ROWS_ | La cantidad de filas de la tabla o columna. | `FILAS(Causas)` | `6` |
| `COLUMNAS(rango)`<br>_alias: COLUMNS_ | La cantidad de columnas de la tabla. | `COLUMNAS(Causas)` | `4` |

## Matrices

| Función | Qué hace | Ejemplo | Resultado |
| --- | --- | --- | --- |
| `FILTRAR(matriz; incluir; [si_vacío])`<br>_alias: FILTER_ | Las filas de la matriz en las que incluir es VERDADERO (una condición sobre una columna, del mismo largo). Si no queda ninguna, si_vacío (o #N/D; Excel da #¡CALC!). | `FILTRAR(Causas; Causas[Fuero] = "Federal")` | Pérez, Federal, 320000, 40<br>Gómez, Federal, 850000, 12 |
| `ORDENAR(matriz; [columna]; [orden])`<br>_alias: SORT_ | Las filas ordenadas por una columna (desde 1; si falta, la primera). Orden 1 (si falta): ascendente; -1: descendente. Las vacías van al final. | `ORDENAR(Causas; 3; -1)` | Díaz, Penal Económico, 980000, 8<br>Gómez, Federal, 850000, 12<br>Sosa, Criminal, 450000, 25<br>Pérez, Federal, 320000, 40<br>Ruiz, Criminal, 210000, <br>López, Penal Económico, 150000, 60 |
| `UNICOS(matriz; [por_columna]; [solo_una_vez])`<br>_alias: UNIQUE_ | Las filas sin repetir (sin distinguir mayúsculas), en el orden en que aparecen. Con solo_una_vez VERDADERO, las que aparecen una sola vez. Por columna no está. | `UNICOS(Causas[Fuero])` | Federal<br>Penal Económico<br>Criminal |
| `ELEGIRCOLS(matriz; columna1; [columna2]; …)`<br>_alias: CHOOSECOLS_ | Las columnas indicadas (desde 1; negativas, desde la última), en ese orden. | `ELEGIRCOLS(Causas; 1; 3)` | Pérez, 320000<br>Gómez, 850000<br>López, 150000<br>Díaz, 980000<br>Ruiz, 210000<br>Sosa, 450000 |
| `TOMAR(matriz; filas; [columnas])`<br>_alias: TAKE_ | Las primeras filas (negativo: las últimas) y, si se indica, las primeras columnas. Con 0, #N/D (Excel da #¡CALC!). | `TOMAR(ORDENAR(Causas; 3; -1); 2)` | Díaz, Penal Económico, 980000, 8<br>Gómez, Federal, 850000, 12 |

## Texto

| Función | Qué hace | Ejemplo | Resultado |
| --- | --- | --- | --- |
| `CONCAT(texto1; [texto2]; …)`<br>_alias: CONCATENAR, CONCATENATE_ | Une los textos, igual que el operador &. Los números van como en el formato General: 1,5 → "1,5". | `CONCAT("Total: "; 1234,5; " $")` | `Total: 1234,5 $` |
| `IZQUIERDA(texto; [cantidad])`<br>_alias: LEFT_ | Los primeros caracteres del texto (por defecto, uno). | `IZQUIERDA("20-12345678-9"; 2)` | `20` |
| `DERECHA(texto; [cantidad])`<br>_alias: RIGHT_ | Los últimos caracteres del texto (por defecto, uno). | `DERECHA("20-12345678-9"; 1)` | `9` |
| `EXTRAE(texto; posición_inicial; cantidad)`<br>_alias: MID_ | Una parte del texto: desde la posición (la primera es 1), esa cantidad de caracteres. | `EXTRAE("20-12345678-9"; 4; 8)` | `12345678` |
| `LARGO(texto)`<br>_alias: LEN_ | La cantidad de caracteres, espacios incluidos. | `LARGO("hola mundo")` | `10` |
| `MAYUSC(texto)`<br>_alias: UPPER_ | El texto en mayúsculas. | `MAYUSC("año fiscal")` | `AÑO FISCAL` |
| `MINUSC(texto)`<br>_alias: LOWER_ | El texto en minúsculas. | `MINUSC("IVA Responsable")` | `iva responsable` |
| `ESPACIOS(texto)`<br>_alias: TRIM_ | Quita los espacios del principio y del final, y deja uno solo entre palabras. | `ESPACIOS("  Juan    Pérez ")` | `Juan Pérez` |
| `TEXTO(valor; formato)`<br>_alias: TEXT_ | El número (o la fecha) como texto, con un formato de Excel: "#.##0,00", "0%", "dd/mm/aaaa", "mmmm". | `TEXTO(1234,5; "$ #.##0,00")` | `$ 1.234,50` |
| `HALLAR(texto_buscado; dentro_del_texto; [posición_inicial])`<br>_alias: SEARCH_ | La posición del texto buscado dentro de otro, sin distinguir mayúsculas y con comodines (* y ?). Si no está, #¡VALOR!: ESNUMERO(HALLAR(…)) dice si lo contiene. | `HALLAR("pérez"; "Juan Pérez")` | `6` |
| `ENCONTRAR(texto_buscado; dentro_del_texto; [posición_inicial])`<br>_alias: FIND_ | Como HALLAR, pero distingue mayúsculas y sin comodines: el texto buscado, tal cual. | `ENCONTRAR("P"; "Juan Pérez")` | `6` |
| `CONTIENE(texto; texto_buscado)`<br>_propia de Kalc_ | VERDADERO si el texto contiene el texto buscado, sin distinguir mayúsculas y con comodines (* y ?), como HALLAR. No es de Excel: allá se escribe ESNUMERO(HALLAR(texto_buscado; texto)). | `CONTIENE("Juan Pérez"; "pérez")` | `VERDADERO` |
| `VALOR(texto)`<br>_alias: VALUE_ | Convierte en número un texto escrito como número o como fecha: "1.234,5", "50%", "31/12/2026". | `VALOR("1.234,5") * 2` | `2469` |

## Fechas

| Función | Qué hace | Ejemplo | Resultado |
| --- | --- | --- | --- |
| `HOY()`<br>_alias: TODAY; volátil_ | La fecha de hoy (sin hora). Se recalcula en cada evaluación. | `HOY()` | _cambia con la fecha_ |
| `FECHA(año; mes; día)`<br>_alias: DATE_ | Arma una fecha. El mes y el día pueden pasarse de rango: FECHA(2026; 13; 1) es el 01/01/2027 y el día 0 es el último del mes anterior. | `FECHA(2026; 3; 0)` | `28/02/2026` |
| `AÑO(fecha)`<br>_alias: YEAR_ | El año de una fecha. | `AÑO(FECHA(2026; 12; 31))` | `2026` |
| `MES(fecha)`<br>_alias: MONTH_ | El mes de una fecha, de 1 a 12. | `MES("31/12/2026")` | `12` |
| `DIA(fecha)`<br>_alias: DAY_ | El día del mes de una fecha, de 1 a 31. | `DIA(FECHA(2026; 3; 0))` | `28` |
| `DIAS(fecha_final; fecha_inicial)`<br>_alias: DAYS_ | Los días entre dos fechas (negativo si la final es anterior). | `DIAS("31/12/2026"; "1/1/2026")` | `364` |
| `FIN.MES(fecha_inicial; meses)`<br>_alias: EOMONTH_ | El último día del mes, tantos meses antes (negativo) o después de la fecha. | `FIN.MES("15/01/2028"; 1)` | `29/02/2028` |
| `FECHA.MES(fecha_inicial; meses)`<br>_alias: EDATE_ | La misma fecha, tantos meses antes o después. Si el día no existe en ese mes, el último: 31/01 + 1 mes = 28/02 (o 29). | `FECHA.MES("31/01/2026"; 1)` | `28/02/2026` |

## Información

| Función | Qué hace | Ejemplo | Resultado |
| --- | --- | --- | --- |
| `ESNUMERO(valor)`<br>_alias: ISNUMBER_ | VERDADERO si el valor es un número (o una fecha). Un texto como "3" no cuenta. | `ESNUMERO("3")` | `FALSO` |
| `ESTEXTO(valor)`<br>_alias: ISTEXT_ | VERDADERO si el valor es un texto. | `ESTEXTO("3")` | `VERDADERO` |
| `ESBLANCO(valor)`<br>_alias: ISBLANK_ | VERDADERO si es una variable sin valor. Un texto vacío ("") no es blanco. | `ESBLANCO("")` | `FALSO` |
| `ESERROR(valor)`<br>_alias: ISERROR_ | VERDADERO si el valor es cualquier error (#N/D, #¡DIV/0!…). | `ESERROR(1/0)` | `VERDADERO` |

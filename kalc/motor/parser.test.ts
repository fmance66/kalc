import { describe, expect, it } from 'vitest'
import { dependencias, type Nodo } from './ast.ts'
import { tokenizar } from './lexer.ts'
import { parsear } from './parser.ts'

/** El árbol escrito con paréntesis, para comparar precedencias de un vistazo. */
function forma(n: Nodo): string {
  switch (n.clase) {
    case 'numero':
    case 'logico':
      return String(n.valor)
    case 'texto':
      return JSON.stringify(n.valor)
    case 'error':
      return n.valor
    case 'referencia':
      return n.nombre
    case 'omitido':
      return '_'
    case 'unario':
      return `(${n.operador}${forma(n.operando)})`
    case 'porcentaje':
      return `(${forma(n.operando)}%)`
    case 'binario':
      return `(${forma(n.izquierda)}${n.operador}${forma(n.derecha)})`
    case 'llamada':
      return `${n.nombre}[${n.argumentos.map(forma).join(';')}]`
  }
}

function arbol(formula: string): string {
  const r = parsear(formula)
  if (!r.ok) throw new Error(r.error.mensaje)
  return forma(r.arbol)
}

describe('parser', () => {
  it.each([
    ['1+2*3', '(1+(2*3))'],
    ['(1+2)*3', '((1+2)*3)'],
    ['=-2^2', '((-2)^2)'],
    ['2^3^2', '((2^3)^2)'],
    ['2^-2', '(2^(-2))'],
    ['-50%', '((-50)%)'],
    ['2*50%', '(2*(50%))'],
    ['1-2-3', '((1-2)-3)'],
    ['"a"&1+2', '("a"&(1+2))'],
    ['1+2&3=4', '(((1+2)&3)=4)'],
    ['A<>B', '(A<>B)'],
    ['1<=2', '(1<=2)'],
    ['1,5', '1.5'],
    ['"dijo ""hola"""', '"dijo \\"hola\\""'],
    ['verdadero', 'true'],
    ['FALSE', 'false'],
    ['#N/A', '#N/D'],
    ['#¡div/0!', '#¡DIV/0!'],
    ['si(A;1;2)', 'SI[A;1;2]'],
    ['SI.ERROR(1/0;0)', 'SI.ERROR[(1/0);0]'],
    ['HOY()', 'HOY[]'],
    ['SI(A;;2)', 'SI[A;_;2]'],
    ['SI(A;1;)', 'SI[A;1;_]'],
    ['[Base imponible]*Alícuota', '(Base imponible*Alícuota)'],
    ['base_imponible', 'base_imponible'],
    ['+A', '(+A)'],
    ['VERDADERO()', 'VERDADERO[]'],
  ])('%s → %s', (formula, esperado) => {
    expect(arbol(formula)).toBe(esperado)
  })

  it.each([
    ['', 'La fórmula está vacía', 0, 0],
    ['=', 'La fórmula está vacía', 1, 1],
    ['1+', 'La fórmula termina antes de tiempo: falta un valor', 2, 2],
    ['(1+2', 'Falta cerrar el paréntesis', 0, 1],
    ['1+2)', 'Sobra un paréntesis de cierre', 3, 4],
    ['SI(A,1,2)', 'Los argumentos se separan con punto y coma (;); la coma es el separador decimal', 4, 5],
    ['1.5', 'El separador decimal es la coma (1,5), no el punto', 1, 2],
    ['"abc', 'Falta cerrar las comillas del texto', 0, 4],
    ['1 2', 'Falta un operador antes de esto', 2, 3],
    ['*2', 'Falta un valor antes de *', 0, 1],
    ['SUMA(1 2)', 'Falta un ; entre los argumentos', 7, 8],
    ['SUMA(1;2', 'Falta cerrar el paréntesis de SUMA', 4, 5],
    ['#HOLA', 'Error desconocido (por ejemplo: #N/D, #¡VALOR!)', 0, 1],
    ['[ ]', 'Nombre vacío entre corchetes', 0, 3],
  ])('"%s": %s', (formula, mensaje, inicio, fin) => {
    expect(parsear(formula)).toEqual({ ok: false, error: { mensaje, inicio, fin } })
  })

  it('guarda la posición de cada nodo en el texto', () => {
    const r = parsear('=A + SUMA(1;2)')
    if (!r.ok) throw new Error()
    expect(r.arbol).toMatchObject({ inicio: 1, fin: 14, derecha: { clase: 'llamada', inicio: 5, fin: 14 } })
  })

  it('extrae las dependencias sin repetir', () => {
    const r = parsear('A + a * SI(B; [C d]; A)')
    if (!r.ok) throw new Error()
    expect(dependencias(r.arbol)).toEqual(['A', 'B', 'C d'])
  })

  it('el lexer reconoce los operadores dobles', () => {
    expect(tokenizar('<><=>=').map((t) => ('valor' in t ? t.valor : t.clase))).toEqual(['<>', '<=', '>=', 'fin'])
  })
})

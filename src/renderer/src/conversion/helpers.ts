/**
 * The functions every conversion script can call beside the JavaScript
 * built-ins. Each is defined once in the script engine from `source`, and
 * the editor offers it by `signature` and `doc` while typing.
 */
export interface ScriptHelper {
  name: string
  signature: string
  doc: string
  source: string
}

export const SCRIPT_HELPERS: ScriptHelper[] = [
  {
    name: 'lerp',
    signature: 'lerp(x, x1, x2, y1, y2)',
    doc: 'x on the line through (x1, y1) and (x2, y2); y1 when x1 equals x2.',
    source:
      'function lerp(x, x1, x2, y1, y2) { return x1 === x2 ? y1 : y1 + ((x - x1) * (y2 - y1)) / (x2 - x1) }'
  },
  {
    name: 'clamp',
    signature: 'clamp(x, min, max)',
    doc: 'x, held between min and max.',
    source: 'function clamp(x, min, max) { return Math.min(Math.max(x, min), max) }'
  },
  {
    name: 'round',
    signature: 'round(x, decimals = 0)',
    doc: 'x rounded to that many decimals.',
    source:
      'function round(x, decimals = 0) { const f = Math.pow(10, decimals); return Math.round(x * f) / f }'
  },
  {
    name: 'bit',
    signature: 'bit(x, n)',
    doc: 'Bit n of x, 0 or 1, counted from 0 at the least significant bit.',
    source: 'function bit(x, n) { return Math.floor(x / Math.pow(2, n)) % 2 }'
  },
  {
    name: 'bits',
    signature: 'bits(x, from, count)',
    doc: 'The count bits of x from bit from upward, as a number.',
    source:
      'function bits(x, from, count) { return Math.floor(x / Math.pow(2, from)) % Math.pow(2, count) }'
  },
  {
    name: 'bcd',
    signature: 'bcd(x)',
    doc: 'x read as binary-coded decimal, four bits a digit: 0x1234 is 1234.',
    source:
      'function bcd(x) { let value = 0, place = 1; while (x > 0) { value += (x % 16) * place; place *= 10; x = Math.floor(x / 16) } return value }'
  }
]

/** Code that goes into the editor at the cursor, from the Insert menu. */
export interface ScriptTemplate {
  label: string
  code: string
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    label: 'Power factor with its sign',
    code: '// -1..1 written as -10000..10000; the sign says inductive or capacitive.\nconst inductive = raw < 0\nreturn Math.abs(raw) / 10000\n'
  },
  {
    label: '4-20 mA, held in range',
    code: '// 0..27648 is 4..20 mA, which is 0..10 bar.\nconst mA = lerp(raw, 0, 27648, 4, 20)\nreturn clamp(lerp(mA, 4, 20, 0, 10), 0, 10)\n'
  },
  {
    label: 'One bit as 0 or 1',
    code: 'return bit(raw, 0)\n'
  },
  {
    label: 'Lookup in a table',
    code: '// Pairs of raw and value, raw rising; between two, a straight line.\nconst table = [\n  [0, 0],\n  [1000, 12.5],\n  [4000, 100]\n]\nfor (let i = 1; i < table.length; i++) {\n  const [x2, y2] = table[i]\n  const [x1, y1] = table[i - 1]\n  if (raw <= x2 || i === table.length - 1) return lerp(raw, x1, x2, y1, y2)\n}\nreturn table[0][1]\n'
  }
]

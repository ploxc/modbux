// A conversion script is refused when some path through it ends without
// returning a value, rather than found out on the reading that takes it.
import { describe, expect, it } from 'vitest'
import { returnsEverywhere } from '../returnsEverywhere'

describe('returnsEverywhere', () => {
  it.each([
    ['a return', 'return raw / 10'],
    ['a return after other statements', 'const inductive = raw < 0\nreturn Math.abs(raw)'],
    ['an if and an else that both return', 'if (raw < 0) {\n  return -raw\n} else return raw'],
    ['an if that returns, then a return', 'if (raw < 0) return 0\nreturn raw'],
    ['a throw', "throw new Error('no')"],
    ['a try and its catch both returning', 'try { return raw } catch (e) { return 0 }'],
    ['a finally that returns', 'try { raw++ } finally { return raw }'],
    [
      'a switch with a default, every case returning',
      'switch (raw) {\n  case 1:\n  case 2: return 1\n  default: return 0\n}'
    ]
  ])('takes %s', (_, code) => {
    expect(returnsEverywhere(code)).toBe(true)
  })

  it.each([
    ['nothing', ''],
    ['no return', 'const value = raw * 2'],
    ['a return of nothing', 'return'],
    ['an if without an else', 'if (raw > 0) return raw'],
    ['an else that does not return', 'if (raw > 0) return raw\nelse raw = 0'],
    ['a catch that does not return', 'try { return raw } catch (e) { raw = 0 }'],
    ['a switch without a default', 'switch (raw) { case 1: return 1 }'],
    ['a case that breaks', 'switch (raw) { case 1: break\ndefault: return 0 }'],
    // The return after the break is never reached.
    [
      'a case that breaks before its return',
      'switch (raw) { case 1: break; return 1\ndefault: return 0 }'
    ],
    ['a return inside a loop only', 'for (let i = 0; i < 1; i++) return raw']
  ])('refuses %s', (_, code) => {
    expect(returnsEverywhere(code)).toBe(false)
  })
})

// The helpers a conversion script can call, run where scripts run.
import { beforeAll, describe, expect, it } from 'vitest'
import { initScriptEngine, runScript, scriptError } from '../scriptEngine'
import { SCRIPT_TEMPLATES } from '../helpers'

beforeAll(async () => {
  await initScriptEngine()
})

describe('the script helpers', () => {
  it.each([
    ['lerp', 'return lerp(raw, 0, 27648, 4, 20)', 13824, 12],
    ['lerp with one x twice', 'return lerp(raw, 5, 5, 7, 9)', 100, 7],
    ['clamp below', 'return clamp(raw, 0, 10)', -3, 0],
    ['clamp above', 'return clamp(raw, 0, 10)', 12, 10],
    ['round to decimals', 'return round(raw / 3, 2)', 10, 3.33],
    ['round to whole', 'return round(raw / 4)', 10, 3],
    ['bit set', 'return bit(raw, 3)', 0b1000, 1],
    ['bit clear', 'return bit(raw, 2)', 0b1000, 0],
    ['bits', 'return bits(raw, 4, 4)', 0xabcd, 0xc],
    ['bcd', 'return bcd(raw)', 0x1234, 1234]
  ])('%s', (_, code, raw, value) => {
    expect(runScript(code, raw)).toBe(value)
  })
})

describe('the Insert templates', () => {
  it.each(SCRIPT_TEMPLATES.map(({ label, code }) => [label, code]))(
    '%s can be saved',
    (_, code) => {
      expect(scriptError(code)).toBeUndefined()
    }
  )

  it('looks a value up between the rows of its table', () => {
    const table = SCRIPT_TEMPLATES.find(({ label }) => label === 'Lookup in a table')
    expect(table && runScript(table.code, 2500)).toBe(56.25)
  })
})

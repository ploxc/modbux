// A conversion script runs in QuickJS: `raw` in, a number out, and nothing of
// the app within its reach.
import { beforeAll, describe, expect, it } from 'vitest'
import { initScriptEngine, runScript, scriptError } from '../scriptEngine'

beforeAll(async () => {
  await initScriptEngine()
})

describe('runScript', () => {
  it('returns what the script returns for raw', () => {
    expect(runScript('const inductive = raw < 0\nreturn Math.abs(raw) / 10000', -9512)).toBe(0.9512)
  })

  it('answers an error for a return that is not a number', () => {
    expect(runScript("return 'kW'", 1)).toEqual({ message: 'The script returned kW, not a number' })
  })

  it('cuts off a script that never ends', () => {
    const answer = runScript('while (true) {}', 1)
    expect(typeof answer).toBe('object')
  })

  it('cuts off a script that closes its wrapper and loops while it compiles', () => {
    const escape = '}); while (true) {} (function (raw) {'
    expect(scriptError(escape)).toEqual(expect.objectContaining({ message: 'interrupted' }))
    expect(runScript(escape, 1)).toEqual(expect.objectContaining({ message: 'interrupted' }))
  })

  it('sees nothing of the window it runs beside', () => {
    expect(
      runScript("return typeof window === 'undefined' && typeof fetch === 'undefined' ? 1 : 0", 1)
    ).toBe(1)
  })
})

describe('the compiled scripts it keeps', () => {
  // A script typed out compiles every text it passes through.
  it('still runs a script after a hundred others were compiled', () => {
    for (let i = 0; i < 100; i++) runScript(`return raw + ${i}`, 1)
    expect(runScript('return raw + 0', 1)).toBe(1)
    expect(runScript('return raw + 99', 1)).toBe(100)
  })
})

describe('scriptError', () => {
  it('names the line a script fails to compile on', () => {
    expect(scriptError('const inductive = raw < 0\nreturn Math.abs(raw / 10000')).toMatchObject({
      line: 2
    })
  })

  it('names the last line of a script that can end without a value', () => {
    expect(scriptError('if (raw > 0) {\n  return raw\n}')).toEqual({
      message: 'Not every path returns a value',
      line: 3
    })
  })

  it('answers nothing for a script that compiles', () => {
    expect(scriptError('return raw')).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import {
  getDummyRegisterData,
  isLoggable,
  isLogged,
  loggedValue,
  RegisterMapObjectSchema
} from '..'

describe('isLoggable', () => {
  it('takes a register with a number data type, a bitmap, and a bit with a comment', () => {
    expect(isLoggable('holding_registers', { dataType: 'float' })).toBe(true)
    expect(isLoggable('input_registers', { dataType: 'uint64' })).toBe(true)
    expect(isLoggable('holding_registers', { dataType: 'bitmap' })).toBe(true)
    expect(isLoggable('coils', { comment: 'Pump' })).toBe(true)
  })

  it('refuses what the read configuration leaves out, and a text or a timestamp', () => {
    expect(isLoggable('holding_registers', undefined)).toBe(false)
    expect(isLoggable('holding_registers', { comment: 'no data type' })).toBe(false)
    expect(isLoggable('holding_registers', { dataType: 'none' })).toBe(false)
    expect(isLoggable('coils', { comment: '  ' })).toBe(false)
    expect(isLoggable('holding_registers', { dataType: 'utf8' })).toBe(false)
    expect(isLoggable('holding_registers', { dataType: 'unix' })).toBe(false)
    expect(isLoggable('holding_registers', { dataType: 'datetime' })).toBe(false)
  })
})

describe('isLogged', () => {
  it('needs a log setting on a register that can log', () => {
    expect(isLogged('holding_registers', { dataType: 'int16' })).toBe(false)
    expect(isLogged('holding_registers', { dataType: 'int16', log: { mode: 'poll' } })).toBe(true)
    expect(isLogged('holding_registers', { dataType: 'utf8', log: { mode: 'poll' } })).toBe(false)
  })
})

describe('loggedValue', () => {
  // A word of its own per data type, so a value names the word it came from.
  const row = {
    ...getDummyRegisterData(0),
    words: {
      int16: -1,
      uint16: 2,
      int32: -3,
      uint32: 4,
      unix: '5',
      float: 6.5,
      int64: -7n,
      uint64: 8n,
      double: 9.25,
      datetime: '10',
      utf8: 'eleven'
    }
  }

  it('is the word the data type decodes, before any conversion', () => {
    expect(loggedValue('holding_registers', 'int16', row)).toBe(-1)
    expect(loggedValue('holding_registers', 'uint32', row)).toBe(4)
    expect(loggedValue('holding_registers', 'float', row)).toBe(6.5)
    expect(loggedValue('holding_registers', 'int64', row)).toBe(-7)
    expect(loggedValue('holding_registers', 'uint64', row)).toBe(8)
    expect(loggedValue('holding_registers', 'double', row)).toBe(9.25)
  })

  it("is a bitmap's word, and 1 or 0 for a bit", () => {
    expect(loggedValue('holding_registers', 'bitmap', row)).toBe(2)
    expect(loggedValue('coils', undefined, { ...row, bit: true })).toBe(1)
    expect(loggedValue('discrete_inputs', undefined, { ...row, bit: false })).toBe(0)
  })

  it('is nothing for a text, a row that carries no words, or a read that failed', () => {
    expect(loggedValue('holding_registers', 'utf8', row)).toBeUndefined()
    expect(loggedValue('coils', undefined, { ...row, error: 'Timed out' })).toBeUndefined()
    expect(loggedValue('holding_registers', 'int16', { ...row, words: undefined })).toBeUndefined()
  })
})

describe('the log setting in a mapping', () => {
  it('is kept, and a negative deadband is refused', () => {
    const kept = RegisterMapObjectSchema.parse({
      '0': { dataType: 'int16', log: { mode: 'change', deadband: 0.5 } }
    })
    expect(kept['0']?.log).toEqual({ mode: 'change', deadband: 0.5 })
    expect(
      RegisterMapObjectSchema.safeParse({
        '0': { dataType: 'int16', log: { mode: 'change', deadband: -1 } }
      }).success
    ).toBe(false)
  })
})

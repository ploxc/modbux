import { describe, it, expect } from 'vitest'
import { notEmpty, humanizeSerialError } from '../utils'
import { getDummyRegisterData, dummyWords, MAIN_SERVER_UUID } from '../default'

// ---------------------------------------------------------------------------
// notEmpty
// ---------------------------------------------------------------------------
describe('notEmpty', () => {
  it('returns true for non-empty strings', () => {
    expect(notEmpty('hello')).toBe(true)
    expect(notEmpty('1')).toBe(true)
  })

  it('returns true for numbers', () => {
    expect(notEmpty(42)).toBe(true)
    expect(notEmpty(0)).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(notEmpty('')).toBe(false)
  })

  it('returns true for negative numbers (strips dash)', () => {
    expect(notEmpty(-5)).toBe(true)
  })

  it('returns false for just a minus sign', () => {
    expect(notEmpty('-')).toBe(false)
  })

  it('returns false for a second minus sign as well', () => {
    expect(notEmpty('--')).toBe(false)
    expect(notEmpty('--5')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// humanizeSerialError
// ---------------------------------------------------------------------------
describe('humanizeSerialError', () => {
  it('humanizes "file not found" errors', () => {
    const err = new Error('file not found')
    expect(humanizeSerialError(err)).toBe('Port not found or not available')
  })

  it('humanizes "access denied" errors', () => {
    const err = new Error('Access denied')
    expect(humanizeSerialError(err)).toBe('Port access denied (already in use?)')
  })

  it('humanizes "permission denied" errors', () => {
    const err = new Error('Permission denied')
    expect(humanizeSerialError(err)).toBe('Port access denied (already in use?)')
  })

  it('prepends port name when provided', () => {
    const err = new Error('file not found')
    expect(humanizeSerialError(err, 'COM3')).toBe('COM3: Port not found or not available')
  })

  it('prepends port name for access denied', () => {
    const err = new Error('access denied')
    expect(humanizeSerialError(err, '/dev/ttyUSB0')).toBe(
      '/dev/ttyUSB0: Port access denied (already in use?)'
    )
  })

  it('returns original message for unknown errors', () => {
    const err = new Error('Connection timeout')
    expect(humanizeSerialError(err)).toBe('Connection timeout')
  })

  it('prepends port name for an error it does not recognise', () => {
    const err = new Error('Something went wrong')
    expect(humanizeSerialError(err, 'COM5')).toBe('COM5: Something went wrong')
  })

  it('prepends port name for an error with no message', () => {
    const err = Object.assign(new Error(''), { code: 'EBUSY' })
    expect(humanizeSerialError(err, 'COM5')).toBe('COM5: Connection failed (EBUSY)')
  })
})

// ---------------------------------------------------------------------------
// default.ts exports
// ---------------------------------------------------------------------------
describe('dummyWords', () => {
  it('has zero/empty values for all data types', () => {
    expect(dummyWords).toEqual({
      int16: 0,
      uint16: 0,
      int32: 0,
      uint32: 0,
      unix: '',
      float: 0,
      int64: 0n,
      uint64: 0n,
      double: 0,
      datetime: '',
      utf8: ''
    })
  })
})

describe('getDummyRegisterData', () => {
  it('returns register data with the correct id', () => {
    const data = getDummyRegisterData(42)
    expect(data.id).toBe(42)
  })

  it('returns zeroed-out register data', () => {
    const data = getDummyRegisterData(0)
    expect(data.bit).toBe(false)
    expect(data.hex).toBe('0000')
    expect(data.buffer).toEqual(Uint8Array.from([0, 0]))
    expect(data.isScanned).toBe(false)
  })

  it('returns a fresh copy of dummyWords (not shared reference)', () => {
    const a = getDummyRegisterData(0)
    const b = getDummyRegisterData(1)
    expect(a.words).toEqual(b.words)
    expect(a.words).not.toBe(b.words)
  })

  // ! Coverage-only: duplicates dummyWords test above, just through the function
  it('contains all expected word fields', () => {
    const data = getDummyRegisterData(0)
    expect(data.words).toEqual({
      int16: 0,
      uint16: 0,
      int32: 0,
      uint32: 0,
      unix: '',
      float: 0,
      int64: 0n,
      uint64: 0n,
      double: 0,
      datetime: '',
      utf8: ''
    })
  })
})

describe('MAIN_SERVER_UUID', () => {
  // ! Coverage-only: validates format of a hardcoded constant
  it('is a valid UUID string', () => {
    expect(MAIN_SERVER_UUID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })
})

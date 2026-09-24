import { describe, it, expect, vi } from 'vitest'
import type { RegisterData, RegisterMapObject } from '@shared'

// ─── Store stub ──────────────────────────────────────────────────────
// The column reads the address groups the last read was made of, and the real
// store subscribes to main on import.

const dataState = { addressGroups: [] as [number, number][] }

vi.mock('@renderer/context/data.zustand', () => ({
  getShownData: (): typeof dataState => dataState
}))

import { convertedValueColumn } from '../convertedValue'

/** A row carrying the utf8 the read buffer holds from this address onward. */
const rowAt = (address: number, utf8: string): RegisterData => ({
  id: address,
  buffer: Buffer.alloc(2),
  hex: '',
  words: {
    int16: 0,
    uint16: 0,
    int32: 0,
    uint32: 0,
    float: 0,
    unix: '',
    int64: BigInt(0),
    uint64: BigInt(0),
    double: 0,
    datetime: '',
    utf8
  },
  bit: false,
  isScanned: false
})

/** A row carrying one number, under every type that reads it as one. */
const numberRowAt = (address: number, value: number): RegisterData => ({
  ...rowAt(address, ''),
  words: {
    int16: value,
    uint16: value,
    int32: 0,
    uint32: 0,
    float: value,
    unix: '',
    int64: BigInt(0),
    uint64: BigInt(0),
    double: value,
    datetime: '',
    utf8: ''
  }
})

/**
 * What the value column shows, or a failure saying the column has no getter.
 *
 * The field is `value` and `RegisterData` has no such key, so the grid types the
 * first argument `never` and the getter reads the row instead. The api ref is
 * the same: the getter takes it and never touches it.
 */
const shownValue = (
  registerMap: RegisterMapObject,
  row: RegisterData,
  showRaw = false
): unknown => {
  const column = convertedValueColumn(registerMap, showRaw)
  const { valueGetter } = column
  if (!valueGetter) throw new Error('the value column has no valueGetter')

  return valueGetter(undefined as never, row, column, undefined as never)
}

describe('how much of a string the value column shows', () => {
  // The group is [address, address + length), so four registers hold eight
  // characters and the ninth belongs to whatever was read after them.
  it('stops at the last register of the group', () => {
    dataState.addressGroups = [[0, 4]]

    expect(shownValue({ 0: { dataType: 'utf8' } }, rowAt(0, 'ABCDEFGHIJKL'))).toBe('ABCDEFGH')
  })

  it('stops at the next register the mapping gives a type', () => {
    dataState.addressGroups = [[0, 8]]

    expect(
      shownValue({ 0: { dataType: 'utf8' }, 3: { dataType: 'uint16' } }, rowAt(0, 'ABCDEFGHIJKL'))
    ).toBe('ABCDEF')
  })

  it('counts from the address the string starts at, not from the group', () => {
    dataState.addressGroups = [[0, 6]]

    expect(shownValue({ 2: { dataType: 'utf8' } }, rowAt(2, 'CDEFGHIJKL'))).toBe('CDEFGHIJ')
  })
})

// `String(undefined)` is the word "undefined" and the guard below it asked
// whether the string was empty, so a row carrying no words drew that word. The
// UTF-8 column cut it to the group, which is `"undefine"` over four registers.
describe('a row that carries no words', () => {
  // What `convertBitData` writes for a coil or a discrete input.
  const wordless = (address: number): RegisterData => ({
    ...rowAt(address, ''),
    words: undefined
  })

  it.each(['datetime', 'unix', 'uint16'] as const)('shows nothing for %s', (dataType) => {
    expect(shownValue({ 0: { dataType } }, wordless(0))).toBe(undefined)
  })

  it('shows nothing for utf8', () => {
    dataState.addressGroups = [[0, 4]]

    expect(shownValue({ 0: { dataType: 'utf8' } }, wordless(0))).toBe(undefined)
  })
})

describe('the number the value column shows', () => {
  // The rounding takes its precision from the factor, so a factor with one
  // decimal that rounded to none would show 12 for a register holding 123.
  it('keeps the decimals the scaling factor introduces', () => {
    expect(shownValue({ 0: { dataType: 'uint16', scalingFactor: 0.1 } }, numberRowAt(0, 123))).toBe(
      12.3
    )
  })

  // A float carries decimals of its own, and the factor's count alone would
  // round them away.
  it('keeps the decimals of a float beside those of the factor', () => {
    expect(shownValue({ 0: { dataType: 'float', scalingFactor: 0.1 } }, numberRowAt(0, 1.25))).toBe(
      0.125
    )
  })

  it('shows the word itself when the toolbar asks for raw', () => {
    expect(
      shownValue({ 0: { dataType: 'uint16', scalingFactor: 0.1 } }, numberRowAt(0, 123), true)
    ).toBe(123)
  })

  // The endpoints are read against the scaled number. Both lines run through
  // the same two points, so a `y1` away from zero is what separates the order
  // they run in: interpolating the word itself answers 10.1 here.
  it('interpolates what the scaling factor answered, not the raw word', () => {
    const map = {
      0: {
        dataType: 'uint16' as const,
        scalingFactor: 0.1,
        interpolate: { x1: '0', x2: '100', y1: '1', y2: '11' }
      }
    }

    expect(shownValue(map, numberRowAt(0, 1000))).toBe(11)
  })

  // Two endpoints on the same x have no slope to read, and the division would
  // answer an Infinity the column would draw.
  it('answers y1 when both endpoints sit on the same x', () => {
    const map = {
      0: { dataType: 'uint16' as const, interpolate: { x1: '1', x2: '1', y1: '7', y2: '99' } }
    }

    expect(shownValue(map, numberRowAt(0, 50))).toBe(7)
  })
})

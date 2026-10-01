// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { stubRenderer } from '@renderer/context/__tests__/stubRenderer'
import { RegisterMapObjectSchema } from '@shared'
import type { RegisterData, RegisterMapObject } from '@shared'
import { initScriptEngine } from '@renderer/conversion/scriptEngine'

// The column takes the address groups the section's last read was made of.
const dataState = { addressGroups: [] as [number, number][] }

// The column's cell reads the stores, which ask `window.api` as they load.
stubRenderer()
const { convertedValueColumn, getConvertedValue } = await import('../convertedValue')
const { bitmapValueColumn } = await import('../bitmapValueColumn')

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
  const column = convertedValueColumn(registerMap, showRaw, dataState.addressGroups)
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
    expect(
      shownValue(
        { 0: { dataType: 'uint16', conversion: { kind: 'scale' as const, factor: 0.1 } } },
        numberRowAt(0, 123)
      )
    ).toBe(12.3)
  })

  // A float carries decimals of its own, and the factor's count alone would
  // round them away.
  it('keeps the decimals of a float beside those of the factor', () => {
    expect(
      shownValue(
        { 0: { dataType: 'float', conversion: { kind: 'scale' as const, factor: 0.1 } } },
        numberRowAt(0, 1.25)
      )
    ).toBe(0.125)
  })

  // JavaScript writes 0.0000001 as 1e-7, which holds no decimal point.
  it('keeps the decimals of a factor written with an exponent', () => {
    expect(
      shownValue(
        { 0: { dataType: 'uint16', conversion: { kind: 'scale' as const, factor: 0.0000001 } } },
        numberRowAt(0, 12345)
      )
    ).toBe(0.0012345)
  })

  it('keeps the decimals of a float written with an exponent', () => {
    expect(
      shownValue(
        { 0: { dataType: 'float', conversion: { kind: 'scale' as const, factor: 10 } } },
        numberRowAt(0, 0.00000015)
      )
    ).toBe(0.0000015)
  })

  it('shows the word itself when the toolbar asks for raw', () => {
    expect(
      shownValue(
        { 0: { dataType: 'uint16', conversion: { kind: 'scale' as const, factor: 0.1 } } },
        numberRowAt(0, 123),
        true
      )
    ).toBe(123)
  })

  // A mapping from before conversions scaled, then interpolated. It reads as
  // an interpolation over raw bounds divided by the scale, and shows what it
  // showed: interpolating the word itself over the old bounds answers 10.1.
  it('shows what a scale and an interpolation from before conversions showed', () => {
    const map = RegisterMapObjectSchema.parse({
      0: {
        dataType: 'uint16',
        scalingFactor: 0.1,
        interpolate: { x1: '0', x2: '100', y1: '1', y2: '11' }
      }
    })

    expect(shownValue(map, numberRowAt(0, 1000))).toBe(11)
  })

  // Two endpoints on the same x have no slope to read, and the division would
  // answer an Infinity the column would draw.
  it('answers y1 when both endpoints sit on the same x', () => {
    const map = {
      0: {
        dataType: 'uint16' as const,
        conversion: { kind: 'lerp' as const, x1: '1', x2: '1', y1: '7', y2: '99' }
      }
    }

    expect(shownValue(map, numberRowAt(0, 50))).toBe(7)
  })

  it('shows what a script returns for the word', async () => {
    await initScriptEngine()
    const map = {
      0: {
        dataType: 'int16' as const,
        conversion: { kind: 'script' as const, code: 'return Math.abs(raw) / 10000' }
      }
    }

    expect(shownValue(map, numberRowAt(0, -9512))).toBe(0.9512)
  })

  it('shows nothing where the script fails', async () => {
    await initScriptEngine()
    const map = {
      0: { dataType: 'int16' as const, conversion: { kind: 'script' as const, code: "return 'x'" } }
    }

    expect(shownValue(map, numberRowAt(0, 1))).toBe(undefined)
  })
})

// RAW left a timestamp parsed, so a unix or datetime register read the same
// with the switch on and off.
describe('a timestamp under RAW', () => {
  const timestampRow = (): RegisterData => ({
    ...rowAt(0, ''),
    words: {
      int16: 0,
      uint16: 0,
      int32: 0,
      uint32: 1_790_000_000,
      float: 0,
      unix: '2026-09-21 14:13:20',
      int64: BigInt(0),
      uint64: BigInt('0x07EA091D0E2D1F40'),
      double: 0,
      datetime: '2026-09-29 14:45:08',
      utf8: ''
    }
  })

  it('shows the seconds a unix register counts', () => {
    expect(shownValue({ 0: { dataType: 'unix' } }, timestampRow(), true)).toBe(1_790_000_000)
    expect(shownValue({ 0: { dataType: 'unix' } }, timestampRow())).toBe('2026-09-21 14:13:20')
  })

  it('shows the four words an IEC 870 datetime packs, in hex', () => {
    expect(shownValue({ 0: { dataType: 'datetime' } }, timestampRow(), true)).toBe(
      '07EA 091D 0E2D 1F40'
    )
    expect(shownValue({ 0: { dataType: 'datetime' } }, timestampRow())).toBe('2026-09-29 14:45:08')
  })
})

// RAW showed a UTF-8 string as its text, in which a zero byte reads as a
// space and a byte UTF-8 cannot decode as a replacement character.
describe('a string under RAW', () => {
  const hexOf: Record<number, string> = { 0: '4142', 1: '0043', 2: 'ff44', 3: '4546' }
  const hexAt = (address: number): string | undefined => hexOf[address]

  it('shows each register it spans as a word of hex', () => {
    const shown = getConvertedValue(
      rowAt(0, 'AB C\ufffdDEF'),
      { 0: { dataType: 'utf8' }, 3: { dataType: 'uint16' } },
      true,
      [[0, 4]],
      hexAt
    )
    expect(shown).toBe('4142 0043 FF44')
  })

  // A filter on the value reads the column's getter, which reads the other
  // registers from the rows the grid holds.
  it('reads the same in the value column a filter reads', () => {
    dataState.addressGroups = [[0, 4]]
    const registerMap: RegisterMapObject = { 0: { dataType: 'utf8' }, 3: { dataType: 'uint16' } }
    const grid = {
      current: {
        getRow: (id: number): RegisterData => ({ ...rowAt(id, ''), hex: hexOf[id] ?? '' })
      }
    }
    // The grid builds the bitmap column, which takes the value column's place.
    for (const build of [convertedValueColumn, bitmapValueColumn]) {
      const column = build(registerMap, true, dataState.addressGroups)
      const { valueGetter } = column
      if (!valueGetter) throw new Error('the value column has no valueGetter')

      expect(valueGetter(undefined as never, rowAt(0, 'AB C'), column, grid as never)).toBe(
        '4142 0043 FF44'
      )
    }
  })

  it('shows the text with RAW off', () => {
    const shown = getConvertedValue(
      rowAt(0, 'AB C\ufffdDEF'),
      { 0: { dataType: 'utf8' }, 3: { dataType: 'uint16' } },
      false,
      [[0, 4]],
      hexAt
    )
    expect(shown).toBe('AB C\ufffdD')
  })
})

import { describe, it, expect, vi } from 'vitest'
import type { RegisterData, RegisterMapObject } from '@shared'

// ─── Store stub ──────────────────────────────────────────────────────
// The column reads the address groups the last read was made of, and the real
// store subscribes to main on import.

const dataState = { addressGroups: [] as [number, number][] }

vi.mock('@renderer/context/data.zustand', () => ({
  useDataZustand: Object.assign(
    (selector: (state: typeof dataState) => unknown) => selector(dataState),
    { getState: () => dataState }
  )
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

/**
 * What the value column shows, or a failure saying the column has no getter.
 *
 * The field is `value` and `RegisterData` has no such key, so the grid types the
 * first argument `never` and the getter reads the row instead. The api ref is
 * the same: the getter takes it and never touches it.
 */
const shownValue = (registerMap: RegisterMapObject, row: RegisterData): unknown => {
  const column = convertedValueColumn(registerMap, false)
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

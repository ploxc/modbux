import { describe, expect, it } from 'vitest'
import { getDummyRegisterData } from '@shared'
import type { RegisterData } from '@shared'
import { skeletonOf } from '@renderer/context/live.zustand.helpers'
import { filtersValues, skeletonRows } from '../skeletonRows'

const row = (address: number, fields: Partial<RegisterData> = {}): RegisterData => ({
  ...getDummyRegisterData(address),
  ...fields
})

describe('the skeleton of the rows a poll read', () => {
  it('is the same string when only values changed', () => {
    expect(skeletonOf([row(0, { hex: '0001' }), row(1)])).toBe(
      skeletonOf([row(0, { hex: 'ffff' }), row(1, { error: 'timeout' })])
    )
  })

  it.each([
    ['another address', [row(0), row(2)]],
    ['a row found by a scan', [row(0), row(1, { isScanned: true })]],
    ['another group', [row(0), row(1, { groupIndex: 2 })]],
    ['one row fewer', [row(0)]]
  ])('changes for %s', (_, other) => {
    expect(skeletonOf([row(0), row(1, { groupIndex: 1 })])).not.toBe(skeletonOf(other))
  })
})

describe('the rows the grid is handed', () => {
  it('carry the address, the scan flag and the group, and no value', () => {
    const rows = skeletonRows(
      skeletonOf([row(3, { hex: 'abcd', isScanned: true, groupIndex: 2 }), row(4)])
    )
    expect(
      rows.map(({ id, isScanned, groupIndex, hex, words }) => ({
        id,
        isScanned,
        groupIndex,
        hex,
        words
      }))
    ).toEqual([
      { id: 3, isScanned: true, groupIndex: 2, hex: '', words: undefined },
      { id: 4, isScanned: false, groupIndex: undefined, hex: '', words: undefined }
    ])
  })

  it('are none for no rows', () => {
    expect(skeletonRows(skeletonOf([]))).toEqual([])
  })
})

describe('a filter that reads a value', () => {
  it.each(['hex', 'value', 'raw', 'word_int16', 'word_double'])('is one on %s', (field) => {
    expect(filtersValues({ items: [{ field, operator: 'contains', value: '1' }] })).toBe(true)
  })

  it.each(['dataType', 'comment', 'scalingFactor', 'groupEnd'])('is not one on %s', (field) => {
    expect(filtersValues({ items: [{ field, operator: 'contains', value: '1' }] })).toBe(false)
  })

  it('is one beside the internal data type filter', () => {
    expect(
      filtersValues({
        items: [
          { id: 1, field: 'dataType', operator: 'not', value: 'none' },
          { id: 2, field: 'hex', operator: 'isEmpty' }
        ]
      })
    ).toBe(true)
  })

  it('is not one with no items', () => {
    expect(filtersValues({ items: [] })).toBe(false)
  })
})

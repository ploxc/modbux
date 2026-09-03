import { RegisterData } from '@shared'
import { describe, expect, it } from 'vitest'
import { seedCoils } from '../writeModal.zustand'

const row = (id: number, bit: boolean): RegisterData => ({
  id,
  buffer: new Uint8Array([0]),
  hex: '',
  words: undefined,
  bit,
  isScanned: false
})

describe('seedCoils', () => {
  it('takes every coil from the row the grid holds for it', () => {
    const rows = [row(0, false), row(1, true), row(2, false), row(3, true)]

    expect(seedCoils(rows, 0, 4)).toEqual([false, true, false, true])
  })

  it('indexes the list from the first address of the range, not from zero', () => {
    const rows = [row(100, true), row(101, false), row(102, true)]

    expect(seedCoils(rows, 100, 3)).toEqual([true, false, true])
  })

  it('leaves an address the grid has no row for alone', () => {
    const rows = [row(0, true), row(2, true)]

    expect(seedCoils(rows, 0, 4)).toEqual([true, false, true, false])
  })

  it('ignores a row outside the range', () => {
    const rows = [row(9, true), row(10, true), row(12, true)]

    expect(seedCoils(rows, 10, 2)).toEqual([true, false])
  })

  it('answers a list as long as the range, whatever the grid holds', () => {
    expect(seedCoils([], 0, 3)).toEqual([false, false, false])
  })
})

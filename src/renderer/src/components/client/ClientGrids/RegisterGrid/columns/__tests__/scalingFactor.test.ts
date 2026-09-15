import { describe, it, expect } from 'vitest'
import type { GridRenderCellParams } from '@mui/x-data-grid/models'
import type { RegisterData, RegisterMapObject } from '@shared'
import { scalingFactorColumn } from '../scalingFactor'

/** A row the grid built for one address; the Scale cell reads nothing else off it. */
const rowAt = (address: number): RegisterData => ({ id: address }) as unknown as RegisterData

/**
 * What the Scale cell shows, or a failure saying the column has no renderer.
 *
 * `renderCell` takes the whole params object and reads `value` and `row`, so
 * the rest of it is never touched.
 */
const shownScale = (registerMap: RegisterMapObject, address: number, value: number): unknown => {
  const { renderCell } = scalingFactorColumn(registerMap)
  if (!renderCell) throw new Error('the scale column has no renderCell')

  return renderCell({ value, row: rowAt(address) } as GridRenderCellParams<RegisterData>)
}

describe('which data types show a scale', () => {
  it('shows it for a number', () => {
    expect(shownScale({ 0: { dataType: 'uint16' } }, 0, 10)).toBe(10)
  })

  it('shows nothing for a type no scale multiplies', () => {
    expect(shownScale({ 0: { dataType: 'datetime' } }, 0, 10)).toBe('')
    expect(shownScale({ 0: { dataType: 'utf8' } }, 0, 10)).toBe('')
    expect(shownScale({ 0: { dataType: 'bitmap' } }, 0, 10)).toBe('')
    expect(shownScale({ 0: { dataType: 'none' } }, 0, 10)).toBe('')
  })

  it('shows nothing for an address the mapping does not name', () => {
    expect(shownScale({}, 0, 10)).toBe('')
  })
})

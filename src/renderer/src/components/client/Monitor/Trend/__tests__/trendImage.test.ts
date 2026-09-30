import { describe, expect, it } from 'vitest'
import { legendRows } from '../trendImage'

const line = (label: string): { color: string; scale: string; label: string; unit: string } => ({
  color: '#81bc57',
  scale: 'left',
  label,
  unit: ''
})
// A label as wide as it has characters, ten pixels each.
const measure = (label: string): number => label.length * 10

describe('legendRows', () => {
  it('places entries after one another on a row', () => {
    const placed = legendRows([line('ab'), line('cde')], 200, measure, 10, 5)
    expect(placed.map(({ x, row }) => [x, row])).toEqual([
      [0, 0],
      [35, 0]
    ])
  })

  it('starts a new row once the next entry would pass the width', () => {
    const placed = legendRows([line('abcd'), line('efgh'), line('ij')], 100, measure, 10, 5)
    expect(placed.map(({ x, row }) => [x, row])).toEqual([
      [0, 0],
      [0, 1],
      [55, 1]
    ])
  })

  it('keeps an entry wider than the row on a row of its own', () => {
    const placed = legendRows([line('a'.repeat(30)), line('b')], 100, measure, 10, 5)
    expect(placed.map(({ row }) => row)).toEqual([0, 1])
  })
})

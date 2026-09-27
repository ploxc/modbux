import { describe, expect, it } from 'vitest'
import { edgeSideOf } from '../edgeDrop'

// A layout 1000 wide and 500 high: the strips are 100 wide at the sides and
// 50 high at the top and bottom.
const rect = { left: 0, right: 1000, top: 0, bottom: 500 }

describe('edgeSideOf', () => {
  it.each([
    [950, 250, 'right'],
    [30, 250, 'left'],
    [500, 20, 'top'],
    [500, 480, 'bottom'],
    // In the corner the nearer edge wins: 10 of 100 is nearer than 30 of 50.
    [990, 470, 'right']
  ] as const)('docks a drop at %i, %i along the %s', (x, y, side) => {
    expect(edgeSideOf(rect, x, y)).toBe(side)
  })

  it.each([
    [850, 250],
    [500, 60]
  ])('leaves a drop at %i, %i to the panel under it', (x, y) => {
    expect(edgeSideOf(rect, x, y)).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { EDGE_STRIP, edgeSideOf } from '../edgeDrop'

// A layout 1000 wide and 500 high. The strips are measured from its edges,
// so the cases name the strip's depth rather than a copy of it.
const rect = { left: 0, right: 1000, top: 0, bottom: 500 }

describe('edgeSideOf', () => {
  it.each([
    [1000 - EDGE_STRIP, 250, 'right'],
    [EDGE_STRIP, 250, 'left'],
    [500, EDGE_STRIP, 'top'],
    [500, 500 - EDGE_STRIP, 'bottom'],
    // In the corner the nearer edge wins.
    [990, 470, 'right']
  ] as const)('docks a drop at %i, %i along the %s', (x, y, side) => {
    expect(edgeSideOf(rect, x, y)).toBe(side)
  })

  it.each([
    [1000 - EDGE_STRIP - 1, 250],
    [EDGE_STRIP + 1, 250],
    [500, EDGE_STRIP + 1]
  ])('leaves a drop at %i, %i to the panel under it', (x, y) => {
    expect(edgeSideOf(rect, x, y)).toBeUndefined()
  })
})

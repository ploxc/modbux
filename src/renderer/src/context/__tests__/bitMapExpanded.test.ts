// @vitest-environment happy-dom
//
// One row at a time carries the expanded panel, and the row that is already
// expanded is what the toggle closes. The store reads its own field from inside
// the recipe, where the draft holds it.
import { beforeEach, describe, expect, it } from 'vitest'
import { useBitMapZustand } from '../bitmap.zustand'

const expandedAddress = (): number | null => useBitMapZustand.getState().expandedAddress

beforeEach(() => {
  useBitMapZustand.setState({ expandedAddress: null, detailHeight: 0 })
})

describe('the row holding the expanded bitmap', () => {
  it('is the one last asked for', () => {
    useBitMapZustand.getState().toggleExpanded(12)

    expect(expandedAddress()).toBe(12)
  })

  it('closes when it is asked for again', () => {
    useBitMapZustand.getState().toggleExpanded(12)
    useBitMapZustand.getState().toggleExpanded(12)

    expect(expandedAddress()).toBe(null)
  })

  it('moves rather than closing when another row is asked for', () => {
    useBitMapZustand.getState().toggleExpanded(12)
    useBitMapZustand.getState().toggleExpanded(13)

    expect(expandedAddress()).toBe(13)
  })
})

// The grid's row positions come from `getRowHeight`, so the panel measures
// itself and writes what it found here.
describe('how tall the panel rendered', () => {
  it('is what was measured', () => {
    useBitMapZustand.getState().setDetailHeight(184)

    expect(useBitMapZustand.getState().detailHeight).toBe(184)
  })
})

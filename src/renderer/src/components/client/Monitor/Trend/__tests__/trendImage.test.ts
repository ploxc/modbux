// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// The lanes' module draws through the trend's plots, whose module reaches the
// client store, which calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { imageLayout, legendRows } from '../trendImage'

const entry = (label: string): { color: string; label: string } => ({ color: '#81bc57', label })
// A label as wide as it has characters, ten pixels each.
const measure = (label: string): number => label.length * 10

describe('legendRows', () => {
  it('places entries after one another on a row', () => {
    const placed = legendRows([entry('ab'), entry('cde')], 200, measure, 10, 5)
    expect(placed.map(({ x, row }) => [x, row])).toEqual([
      [0, 0],
      [35, 0]
    ])
  })

  it('starts a new row once the next entry would pass the width', () => {
    const placed = legendRows([entry('abcd'), entry('efgh'), entry('ij')], 100, measure, 10, 5)
    expect(placed.map(({ x, row }) => [x, row])).toEqual([
      [0, 0],
      [0, 1],
      [55, 1]
    ])
  })

  it('keeps an entry wider than the row on a row of its own', () => {
    const placed = legendRows([entry('a'.repeat(30)), entry('b')], 100, measure, 10, 5)
    expect(placed.map(({ row }) => row)).toEqual([0, 1])
  })
})

describe('imageLayout', () => {
  const blocks = [
    { name: 'plot', height: 100 },
    { name: 'lanes', height: 50 },
    { name: 'time', height: 22 }
  ]

  it('stacks the blocks under the heading, and ends the margin under the last', () => {
    const layout = imageLayout(blocks, 60, 0, 12)
    expect(layout.placed.map(({ name, y }) => [name, y])).toEqual([
      ['plot', 60],
      ['lanes', 160],
      ['time', 210]
    ])
    expect(layout.height).toBe(244)
  })

  it('puts the gap between blocks and not after the last', () => {
    const layout = imageLayout(blocks, 60, 4, 12)
    expect(layout.placed.map(({ y }) => y)).toEqual([60, 164, 218])
    expect(layout.height).toBe(252)
  })

  it('grows with every block, so opened lanes make a taller image', () => {
    const shut = imageLayout(blocks, 60, 0, 12).height
    const opened = imageLayout([...blocks, { name: 'bit', height: 22 }], 60, 0, 12).height
    expect(opened).toBe(shut + 22)
  })
})

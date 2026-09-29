import { describe, expect, it } from 'vitest'
import { logFill } from '../format'

describe('logFill', () => {
  it('draws an empty log as nothing', () => {
    expect(logFill(0, 1_000_000)).toBe('0%')
  })

  it('draws one sample as at least 3 px', () => {
    expect(logFill(3412, 1_000_000)).toBe('max(3px, 0.3412%)')
  })

  it('draws a full log as the whole bar', () => {
    expect(logFill(1_000_000, 1_000_000)).toBe('max(3px, 100%)')
  })

  it('draws no more than the whole bar while a shrunk size is on its way', () => {
    expect(logFill(2000, 1000)).toBe('max(3px, 100%)')
  })
})

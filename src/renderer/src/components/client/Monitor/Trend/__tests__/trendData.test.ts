import { describe, expect, it } from 'vitest'
import type { LogPoint } from '@shared'
import { stepOf, trendGaps, trendSeries, trendSummary } from '../trendData'

const point = (time: number, value: number, error?: string): LogPoint => ({ time, value, error })
const double = (raw: number): number => raw * 2

describe('trendSeries', () => {
  it('converts each sample, and draws a failed read as a gap', () => {
    expect(trendSeries([point(1, 5), point(2, 0, 'Timed out'), point(3, 7)], [], double)).toEqual({
      times: [1, 2, 3],
      values: [10, null, 14]
    })
  })

  it('draws a value the conversion gives no number for as a gap', () => {
    expect(
      trendSeries([point(1, 5), point(2, 6)], [], (raw) => (raw === 6 ? undefined : raw))
    ).toEqual({ times: [1, 2], values: [5, null] })
  })

  it('breaks the line where a run ended, after a sample taken at that moment', () => {
    expect(trendSeries([point(1, 5), point(2, 6), point(9, 7)], [2], double)).toEqual({
      times: [1, 2, 2, 9],
      values: [10, 12, null, 14]
    })
  })

  it('leaves out a run that ended before the first sample drawn', () => {
    expect(trendSeries([point(5, 1)], [3], double)).toEqual({ times: [5], values: [2] })
  })
})

describe('trendSummary', () => {
  it('answers the last, lowest and highest number, passing over gaps', () => {
    expect(trendSummary([3, null, 9, 1, null])).toEqual({ last: 1, min: 1, max: 9 })
  })

  it('answers nothing for a trend of gaps only', () => {
    expect(trendSummary([null])).toEqual({ last: undefined, min: undefined, max: undefined })
  })
})

describe('stepOf', () => {
  it('splits a window into 1,500 steps', () => {
    expect(stepOf(0, 600_000)).toBe(400)
  })

  it('answers no step for a window with no length, or no start', () => {
    expect(stepOf(5, 5)).toBeUndefined()
    expect(stepOf(Number.NEGATIVE_INFINITY, 5)).toBeUndefined()
  })
})

describe('trendGaps', () => {
  it('answers each stretch between two runs with the reason the first ended', () => {
    expect(
      trendGaps(
        [
          { start: 0, end: 10, reason: 'poll stopped' },
          { start: 15, end: 20, reason: 'disconnected' },
          { start: 30 }
        ],
        40
      )
    ).toEqual([
      { start: 10, end: 15, reason: 'poll stopped' },
      { start: 20, end: 30, reason: 'disconnected' }
    ])
  })

  it('runs the gap after a last run that ended up to the end of the trend', () => {
    expect(trendGaps([{ start: 0, end: 10, reason: 'log stopped' }], 40)).toEqual([
      { start: 10, end: 40, reason: 'log stopped' }
    ])
  })
})

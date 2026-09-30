import { describe, expect, it } from 'vitest'
import type { LogPoint } from '@shared'
import type uPlot from 'uplot'
import {
  figure,
  gripAt,
  stepOf,
  trendGaps,
  valuesAt,
  viewWithin,
  zoomAround,
  trendSeries,
  trendSummary
} from '../trendData'

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

describe('viewWithin', () => {
  const bound = { from: 1_000, to: 100_000 }

  it('keeps a stretch inside what the log holds', () => {
    expect(viewWithin(20_000, 30_000, bound, 600_000)).toEqual({ from: 20_000, to: 30_000 })
  })

  it('moves a stretch past either end back inside, keeping its length', () => {
    expect(viewWithin(-5_000, 5_000, bound, 600_000)).toEqual({ from: 1_000, to: 11_000 })
    expect(viewWithin(95_000, 105_000, bound, 600_000)).toEqual({ from: 90_000, to: 100_000 })
  })

  it('zooms in no further than a second', () => {
    expect(viewWithin(20_000, 20_100, bound, 600_000)).toEqual({ from: 20_000, to: 21_000 })
  })

  it('follows the range again once a stretch reaches the end and spans it', () => {
    expect(viewWithin(40_000, 100_000, bound, 60_000)).toBeUndefined()
    expect(viewWithin(0, 200_000, bound, 600_000)).toBeUndefined()
  })

  it('stays zoomed on a stretch as long as the range that ends before the log does', () => {
    expect(viewWithin(10_000, 80_000, bound, 60_000)).toEqual({ from: 10_000, to: 80_000 })
  })

  it('stays zoomed at the end while the stretch is shorter than the range', () => {
    expect(viewWithin(70_000, 100_000, bound, 60_000)).toEqual({ from: 70_000, to: 100_000 })
  })
})

describe('zoomAround', () => {
  it('zooms around the moment under the cursor', () => {
    expect(zoomAround(0, 100, 20, 0.5)).toEqual({ from: 10, to: 60 })
  })
})

describe('valuesAt', () => {
  it('answers each line at a sample, the last before it where only another line has one', () => {
    const joined: uPlot.AlignedData = [
      [1, 2, 3, 4],
      [10, undefined, 30, undefined],
      [undefined, 5, null, undefined]
    ]
    expect(valuesAt(joined, 1)).toEqual([10, 5])
    expect(valuesAt(joined, 3)).toEqual([30, null])
  })

  it('answers nothing for a line before its first sample', () => {
    expect(
      valuesAt(
        [
          [1, 2],
          [undefined, 7]
        ],
        0
      )
    ).toEqual([undefined])
  })
})

describe('figure', () => {
  it('writes a value to six decimals at most, and a gap or no value as a dash', () => {
    expect(figure(1.23456789)).toBe('1.234568')
    expect(figure(100)).toBe('100')
    expect(figure(null)).toBe('–')
    expect(figure(undefined)).toBe('–')
  })
})

describe('gripAt', () => {
  it('holds an edge near either side, and the window between them', () => {
    expect(gripAt(3, 100)).toBe('from')
    expect(gripAt(97, 100)).toBe('to')
    expect(gripAt(50, 100)).toBe('window')
  })

  it('only moves a window too narrow for two edges and a middle', () => {
    expect(gripAt(2, 24)).toBe('window')
    expect(gripAt(22, 24)).toBe('window')
  })
})

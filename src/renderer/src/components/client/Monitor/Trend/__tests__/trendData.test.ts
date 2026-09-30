import { describe, expect, it } from 'vitest'
import type { LogPoint } from '@shared'
import type uPlot from 'uplot'
import {
  bitOn,
  bitsOf,
  figure,
  gripAt,
  indexAt,
  laneAt,
  laneSpans,
  pointAt,
  rangeOf,
  readoutPlace,
  sinceText,
  stepOf,
  trendGaps,
  valuesAt,
  viewWithin,
  zoomAround,
  trendSeries
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

describe('readoutPlace', () => {
  it('sits right of the cursor, and from just above it down in the upper half', () => {
    expect(readoutPlace(100, 50, 800, 300, 100)).toEqual({ left: 112, top: 38 })
  })

  it('sits left of the cursor where the right has no room', () => {
    expect(readoutPlace(700, 50, 800, 300, 100)).toEqual({ left: 468, top: 38 })
  })

  it('never passes the left edge', () => {
    expect(readoutPlace(200, 50, 400, 300, 100)).toEqual({ left: 0, top: 38 })
  })

  it('ends above the cursor in the lower half', () => {
    expect(readoutPlace(100, 250, 800, 300, 100)).toEqual({ left: 112, top: 138 })
  })

  it('stays inside a chart too short for it above or below the cursor', () => {
    expect(readoutPlace(100, 140, 800, 260, 170)).toEqual({ left: 112, top: 0 })
    expect(readoutPlace(100, 120, 800, 260, 170)).toEqual({ left: 112, top: 90 })
  })
})

describe('laneSpans', () => {
  const on = (value: number): boolean => value !== 0

  it('answers each stretch a bit was on, the last up to the end', () => {
    expect(laneSpans([point(1, 0), point(2, 1), point(4, 0), point(6, 1)], [], on, 9)).toEqual([
      { start: 2, end: 4 },
      { start: 6, end: 9 }
    ])
  })

  it('makes one stretch of samples on in a row', () => {
    expect(laneSpans([point(1, 1), point(2, 1), point(3, 0)], [], on, 9)).toEqual([
      { start: 1, end: 3 }
    ])
  })

  it('ends a stretch at a failed read, and at the end of its run', () => {
    expect(laneSpans([point(1, 1), point(2, NaN, 'Timed out'), point(3, 1)], [5], on, 9)).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 5 }
    ])
  })
})

describe('pointAt', () => {
  const points = [point(10, 1), point(20, 2), point(30, 3)]

  it('answers the newest sample at or before a moment', () => {
    expect(pointAt(points, 25)?.value).toBe(2)
    expect(pointAt(points, 30)?.value).toBe(3)
  })

  it('answers nothing before the first sample', () => {
    expect(pointAt(points, 5)).toBeUndefined()
  })
})

describe('bitOn', () => {
  it('reads a bit of a word, and an inverted one on when clear', () => {
    expect(bitOn(0b1001, 3, undefined)).toBe(true)
    expect(bitOn(0b1001, 1, undefined)).toBe(false)
    expect(bitOn(0b1001, 1, true)).toBe(true)
  })
})

describe('bitsOf', () => {
  it('opens into the bits its settings name and the bits that were set', () => {
    expect(bitsOf({ 5: { comment: 'Door open' } }, [point(1, 0b1001), point(2, 0)])).toEqual([
      0, 3, 5
    ])
  })

  it('leaves out a failed read, which carries no word', () => {
    expect(bitsOf(undefined, [point(1, NaN, 'Timed out'), point(2, 0b10)])).toEqual([1])
  })
})

describe('laneAt', () => {
  const points = [point(10, 1), point(20, 0)]

  it('answers the newest sample at or before a moment', () => {
    expect(laneAt(points, [], 15)?.value).toBe(1)
  })

  it('answers nothing once the run ended after that sample', () => {
    expect(laneAt(points, [22], 25)).toBeUndefined()
    expect(laneAt(points, [22], 21)?.value).toBe(0)
  })
})

describe('indexAt', () => {
  it('answers the last index at or before a moment, and none before the first', () => {
    expect(indexAt([10, 20, 30], 25)).toBe(1)
    expect(indexAt([10, 20, 30], 30)).toBe(2)
    expect(indexAt([10, 20, 30], 5)).toBeUndefined()
  })
})

describe('sinceText', () => {
  it('writes minutes and seconds, and hours once there are any', () => {
    expect(sinceText(65_000)).toBe('1:05')
    expect(sinceText(3_725_000)).toBe('1:02:05')
    expect(sinceText(0)).toBe('0:00')
    expect(sinceText(-65_000)).toBe('-1:05')
  })
})

describe('rangeOf', () => {
  it('takes two numbers with the minimum below the maximum', () => {
    expect(rangeOf('0', '250')).toEqual({ min: 0, max: 250 })
    expect(rangeOf('-1.5', '1e3')).toEqual({ min: -1.5, max: 1000 })
  })

  it('refuses an empty field, a minimum at or above the maximum, and a half-typed number', () => {
    expect(rangeOf('', '10')).toBeUndefined()
    expect(rangeOf('10', '10')).toBeUndefined()
    expect(rangeOf('20', '10')).toBeUndefined()
    expect(rangeOf('1e', '10')).toBeUndefined()
    expect(rangeOf('0', '1e999')).toBeUndefined()
    expect(rangeOf('-1e999', '0')).toBeUndefined()
  })
})

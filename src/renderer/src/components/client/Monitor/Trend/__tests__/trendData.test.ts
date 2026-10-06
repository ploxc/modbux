import { describe, expect, it } from 'vitest'
import type { LogPoint } from '@shared'
import { DateTime } from 'luxon'
import {
  axisScale,
  bitOn,
  bitsOf,
  figure,
  gripAt,
  indexAt,
  laneAt,
  laneSpans,
  pickedStretch,
  pointAt,
  rangeOf,
  readoutPlace,
  scaleRange,
  settingsPlace,
  shownStretch,
  sinceText,
  stepOf,
  stretchLabel,
  trendAxes,
  trendGaps,
  valueAt,
  viewWithin,
  plotsOf,
  plotShare,
  navigatorEntry,
  PLOT_MIN_HEIGHT,
  GRIP_HEIGHT,
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

describe('trendAxes', () => {
  it('gives each engineering unit one axis, in the order the lines bring them', () => {
    expect(
      trendAxes([
        { unit: 'A', color: 'red' },
        { unit: 'kW', color: 'blue' },
        { unit: 'A', color: 'green' },
        { unit: 'V', color: 'orange' }
      ])
    ).toEqual([
      { unit: 'A', scale: axisScale('A'), colors: ['red', 'green'] },
      { unit: 'kW', scale: axisScale('kW'), colors: ['blue'] },
      { unit: 'V', scale: axisScale('V'), colors: ['orange'] }
    ])
  })

  it('gives the lines of no unit one axis between them', () => {
    expect(
      trendAxes([
        { unit: '', color: 'red' },
        { unit: '', color: 'blue' }
      ])
    ).toEqual([{ unit: '', scale: axisScale(''), colors: ['red', 'blue'] }])
  })

  it('names a scale per unit, apart from any other', () => {
    expect(axisScale('A')).not.toBe(axisScale('kW'))
    expect(axisScale('')).not.toBe('x')
  })
})

describe('settingsPlace', () => {
  const PANEL = { width: 420, height: 300 }
  const WINDOW = { width: 1440, height: 900 }
  const button = { top: 100, left: 880, right: 904, bottom: 124 }

  it('opens under its button, level with its right edge', () => {
    expect(settingsPlace(button, PANEL, WINDOW)).toEqual({ top: 132, left: 484 })
  })

  it('opens above its button when there is room there and none under it, and else under it', () => {
    const lowButton = { top: 800, left: 880, right: 904, bottom: 824 }
    expect(settingsPlace(lowButton, PANEL, WINDOW)).toEqual({ top: 492, left: 484 })
    // Exactly enough room under it keeps it there.
    const fits = { top: 560, left: 880, right: 904, bottom: 584 }
    expect(settingsPlace(fits, PANEL, WINDOW)).toEqual({ top: 592, left: 484 })
    // With room neither under it nor above it, under it and moved up only as
    // far as the window asks.
    const short = { width: 1440, height: 400 }
    const highButton = { top: 40, left: 880, right: 904, bottom: 64 }
    const panel = { width: 420, height: 325 }
    expect(settingsPlace(highButton, panel, short)).toEqual({ top: 67, left: 484 })
    // Exactly enough room above it takes that.
    const midButton = { top: 316, left: 880, right: 904, bottom: 340 }
    expect(settingsPlace(midButton, PANEL, short)).toEqual({ top: 8, left: 484 })
  })

  it("moves up no higher than the window's top", () => {
    const tall = { width: 420, height: 1000 }
    expect(settingsPlace(button, tall, WINDOW)).toEqual({ top: 8, left: 484 })
  })
})

describe('pickedStretch', () => {
  // The log's oldest sample 350 ms into a second, and now.
  const start = 10_350
  const end = 100_000

  it('holds the stretch picked, pressed on the calendar', () => {
    expect(pickedStretch(20_000, 30_000, start, end)).toEqual({
      from: 20_000,
      to: 30_000,
      pressed: 'calendar'
    })
  })

  it("starts a From picked in the oldest sample's second at that sample", () => {
    expect(pickedStretch(10_000, 30_000, start, end)).toEqual({
      from: 10_350,
      to: 30_000,
      pressed: 'calendar'
    })
  })

  it("refuses a From before the log's start, and a To after its end", () => {
    expect(pickedStretch(9_000, 30_000, start, end)).toBeUndefined()
    expect(pickedStretch(20_000, 101_000, start, end)).toBeUndefined()
    expect(pickedStretch(20_000, 100_000, start, end)).toEqual({
      from: 20_000,
      to: 100_000,
      pressed: 'calendar'
    })
  })

  it('refuses a To less than a second after From, or before it', () => {
    expect(pickedStretch(20_000, 20_000, start, end)).toBeUndefined()
    expect(pickedStretch(30_000, 20_000, start, end)).toBeUndefined()
    expect(pickedStretch(20_000, 21_000, start, end)).toEqual({
      from: 20_000,
      to: 21_000,
      pressed: 'calendar'
    })
  })

  it("refuses a stretch a second long that the oldest sample's second shortens", () => {
    expect(pickedStretch(10_000, 11_000, start, end)).toBeUndefined()
  })
})

describe('stretchLabel', () => {
  const at = (day: number, hour: number, minute: number, second = 0): number =>
    DateTime.fromObject({ year: 2026, month: 9, day, hour, minute, second }).toMillis()

  it('names a stretch within a day by its times and the day', () => {
    expect(stretchLabel(at(29, 14, 5), at(29, 14, 20))).toBe('14:05 to 14:20, 29 Sep')
  })

  it('writes the seconds when either end has some', () => {
    expect(stretchLabel(at(29, 14, 5), at(29, 14, 20, 30))).toBe('14:05:00 to 14:20:30, 29 Sep')
  })

  it('writes each end with its date across two days', () => {
    expect(stretchLabel(at(29, 23, 50), at(30, 0, 10))).toBe('29 Sep 23:50 to 30 Sep 00:10')
  })
})

describe('viewWithin', () => {
  const bound = { from: 1_000, to: 100_000 }

  it('keeps a stretch inside what the log holds', () => {
    expect(viewWithin(20_000, 30_000, bound, 600_000, true)).toEqual({ from: 20_000, to: 30_000 })
  })

  it('moves a stretch past either end back inside, keeping its length', () => {
    expect(viewWithin(-5_000, 5_000, bound, 600_000, true)).toEqual({ from: 1_000, to: 11_000 })
    expect(viewWithin(95_000, 105_000, bound, 600_000, false)).toEqual({
      from: 90_000,
      to: 100_000
    })
  })

  it('zooms in no further than a second', () => {
    expect(viewWithin(20_000, 20_100, bound, 600_000, true)).toEqual({ from: 20_000, to: 21_000 })
  })

  it('follows the range again once a stretch reaches the end and spans it', () => {
    expect(viewWithin(40_000, 100_000, bound, 60_000, true)).toBeUndefined()
    expect(viewWithin(0, 200_000, bound, 600_000, true)).toBeUndefined()
  })

  it('stays zoomed on a stretch as long as the range that ends before the log does', () => {
    expect(viewWithin(10_000, 80_000, bound, 60_000, true)).toEqual({ from: 10_000, to: 80_000 })
  })

  it('follows the running log over a shorter stretch that reaches its end, dragged past it too', () => {
    expect(viewWithin(70_000, 100_000, bound, 60_000, true)).toEqual({ length: 30_000 })
    expect(viewWithin(80_000, 110_000, bound, 60_000, true)).toEqual({ length: 30_000 })
  })

  it('holds a shorter stretch at the end of a log that stopped', () => {
    expect(viewWithin(70_000, 100_000, bound, 60_000, false)).toEqual({
      from: 70_000,
      to: 100_000
    })
  })

  it('holds a shorter stretch that ends before the running log does', () => {
    expect(viewWithin(69_000, 99_000, bound, 60_000, true)).toEqual({ from: 69_000, to: 99_000 })
  })
})

describe('zoomAround', () => {
  it('zooms around the moment under the cursor', () => {
    expect(zoomAround(0, 100, 20, 0.5)).toEqual({ from: 10, to: 60 })
  })
})

describe('valueAt', () => {
  const series = { times: [10, 20, 30], values: [1, null, 3] }

  it('answers the last point at or before the moment, a gap as null', () => {
    expect(valueAt(series, 10)).toBe(1)
    expect(valueAt(series, 29)).toBeNull()
    expect(valueAt(series, 99)).toBe(3)
  })

  it('answers nothing before the first point', () => {
    expect(valueAt(series, 9)).toBeUndefined()
  })
})

describe('plotsOf', () => {
  it('groups lines a plot per engineering unit, in the order the units come, no unit included', () => {
    const lines = [
      { unit: 'V', name: 'a' },
      { unit: '', name: 'b' },
      { unit: 'A', name: 'c' },
      { unit: 'V', name: 'd' },
      { unit: '', name: 'e' }
    ]
    expect(plotsOf(lines).map(({ unit, lines }) => [unit, lines.map(({ name }) => name)])).toEqual([
      ['V', ['a', 'd']],
      ['', ['b', 'e']],
      ['A', ['c']]
    ])
  })

  it('draws as many plots as trendAxes draws axes, in its order', () => {
    const lines = [
      { unit: 'kW', color: 'red' },
      { unit: 'V', color: 'blue' },
      { unit: 'kW', color: 'green' }
    ]
    expect(plotsOf(lines).map(({ unit }) => unit)).toEqual(trendAxes(lines).map(({ unit }) => unit))
  })
})

describe('navigatorEntry', () => {
  const entry = (id: number, hidden?: boolean): { id: number; hidden?: boolean } =>
    hidden === undefined ? { id } : { id, hidden }

  it('draws the first register shown', () => {
    expect(navigatorEntry([entry(0, true), entry(1), entry(2)])?.id).toBe(1)
    expect(navigatorEntry([entry(0), entry(1)])?.id).toBe(0)
  })

  it('draws the first while every one is hidden, and none of none', () => {
    expect(navigatorEntry([entry(0, true), entry(1, true)])?.id).toBe(0)
    expect(navigatorEntry([])).toBeUndefined()
  })
})

describe('plotShare', () => {
  it('shares what the lanes leave of the room over every plot, each less its grip', () => {
    expect(plotShare(600, 100, 2)).toBe(250 - GRIP_HEIGHT)
  })

  it('counts every plot, so one given a height leaves the share of the others alone', () => {
    expect(plotShare(900, 0, 3)).toBe(300 - GRIP_HEIGHT)
  })

  it('never answers under the shortest plot', () => {
    expect(plotShare(200, 150, 2)).toBe(PLOT_MIN_HEIGHT)
    expect(plotShare(0, 0, 1)).toBe(PLOT_MIN_HEIGHT)
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

describe('scaleRange', () => {
  it("takes a scale's minimum and maximum", () => {
    expect(scaleRange({ min: -10, max: 110 })).toEqual({ min: -10, max: 110 })
  })

  it('keeps seven significant digits, at any size', () => {
    expect(scaleRange({ min: 0.1 + 0.2, max: 1234.56789 })).toEqual({ min: 0.3, max: 1234.568 })
    expect(scaleRange({ min: 1.23456789e-9, max: 2e-9 })).toEqual({
      min: 1.234568e-9,
      max: 2e-9
    })
  })

  it('gives none for a scale that holds no value, or none at all', () => {
    expect(scaleRange({})).toBeUndefined()
    expect(scaleRange(undefined)).toBeUndefined()
    expect(scaleRange({ min: 5, max: 5 })).toBeUndefined()
    expect(scaleRange({ min: 0, max: Infinity })).toBeUndefined()
  })
})

describe('shownStretch', () => {
  const MINUTE = 60 * 1000
  const NOW = 100 * MINUTE
  const running = { running: true, oldest: 20 * MINUTE, lastEnd: undefined }
  const stopped = { running: false, oldest: 20 * MINUTE, lastEnd: 70 * MINUTE }

  it('follows the range up to now while the log runs, and up to where it stopped after', () => {
    expect(shownStretch(undefined, '10m', running, NOW)).toEqual({
      from: 90 * MINUTE,
      to: NOW,
      start: 20 * MINUTE,
      end: NOW
    })
    expect(shownStretch(undefined, '10m', stopped, NOW)).toEqual({
      from: 60 * MINUTE,
      to: 70 * MINUTE,
      start: 20 * MINUTE,
      end: 70 * MINUTE
    })
  })

  it("follows over a follow's own length rather than the range's", () => {
    expect(shownStretch({ length: 2 * MINUTE }, '1h', running, NOW).from).toBe(98 * MINUTE)
  })

  it('shows a held view where it is, whatever the range', () => {
    const view = { from: 30 * MINUTE, to: 40 * MINUTE, pressed: 'calendar' as const }
    expect(shownStretch(view, '8h', running, NOW)).toMatchObject({
      from: 30 * MINUTE,
      to: 40 * MINUTE,
      end: NOW
    })
  })

  it('shows the whole log from its oldest sample, and the shortest range while it is empty', () => {
    expect(shownStretch(undefined, 'log', running, NOW).from).toBe(20 * MINUTE)
    expect(shownStretch(undefined, 'log', { ...running, oldest: undefined }, NOW)).toMatchObject({
      from: 90 * MINUTE,
      start: 90 * MINUTE
    })
  })
})

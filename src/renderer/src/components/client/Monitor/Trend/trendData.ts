import {
  BitMapConfig,
  ClientUnit,
  inSteps,
  isLogged,
  LogPoint,
  LogRun,
  LogStopReason,
  AxisRange,
  RegisterType,
  RegisterTypeSchema,
  TrendRangeId,
  TrendSettings
} from '@shared'
import { DateTime } from 'luxon'
import type uPlot from 'uplot'

/** The ranges a trend picks from, in the order it offers them. */
export const TREND_RANGES: readonly { id: TrendRangeId; label: string }[] = [
  { id: '10m', label: '10 min' },
  { id: '1h', label: '1 h' },
  { id: '8h', label: '8 h' },
  { id: 'log', label: 'Whole log' }
]

/** How far back each range reaches, up to where the trend ends; the whole log reaches its oldest sample. */
export const TREND_SPANS: Record<TrendRangeId, number> = {
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  log: Number.POSITIVE_INFINITY
}

/**
 * How many stretches main hands a window back in, each as its lowest and
 * highest value: about two a pixel across a trend as wide as a window.
 */
export const TREND_STEPS = 1500

/** The step main hands a window from `from` to `to` in, as `steps` stretches. */
export const stepOf = (from: number, to: number, steps = TREND_STEPS): number | undefined =>
  to > from && Number.isFinite(to - from) ? (to - from) / steps : undefined

/** Where the log took no samples between two of its runs, and why. */
export interface TrendGap {
  start: number
  end: number
  reason: LogStopReason | undefined
}

/**
 * The stretches between the runs of the log, each from where a run ended to
 * where the next started, and the last to `to` when the log is not running.
 */
export const trendGaps = (runs: readonly LogRun[], to: number): TrendGap[] =>
  runs.flatMap((run, index) => {
    if (run.end === undefined) return []
    const next = runs[index + 1]
    return [{ start: run.end, end: next === undefined ? to : next.start, reason: run.reason }]
  })

/** What a trend draws: a time per point, and its value or a gap. */
export interface TrendSeries {
  times: number[]
  values: (number | null)[]
}

/**
 * The line a trend draws out of a register's samples: each converted as the
 * grid converts it, a failed read or a value the conversion gives no number
 * for as a gap, and a gap where a run of the log ended after a sample.
 */
export const trendSeries = (
  points: LogPoint[],
  runEnds: number[],
  convert: (raw: number) => number | undefined
): TrendSeries => {
  // A run's end sorts after a sample taken at the same moment.
  const events = [
    ...points.map((point) => ({ time: point.time, order: 0, point })),
    ...runEnds.map((time) => ({ time, order: 1, point: undefined }))
  ].sort((a, b) => a.time - b.time || a.order - b.order)

  const times: number[] = []
  const values: (number | null)[] = []
  for (const { time, point } of events) {
    if (point !== undefined) {
      times.push(time)
      values.push(point.error === undefined ? (convert(point.value) ?? null) : null)
    } else if (times.length > 0) {
      times.push(time)
      values.push(null)
    }
  }
  return { times, values }
}

/** An engineering unit the trend draws an axis for, its scale, and the colours of its lines. */
export interface TrendAxis {
  unit: string
  scale: string
  colors: string[]
}

/** The scale the lines of an engineering unit share. */
export const axisScale = (unit: string): string => `unit:${unit}`

/**
 * An axis per engineering unit the lines are of, in the order the lines
 * bring them, each with its lines' colours. A line of no unit shares the
 * axis of the other lines of none.
 */
export const trendAxes = (lines: readonly { unit: string; color: string }[]): TrendAxis[] => {
  const axes: TrendAxis[] = []
  for (const { unit, color } of lines) {
    const axis = axes.find((each) => each.unit === unit)
    if (axis === undefined) axes.push({ unit, scale: axisScale(unit), colors: [color] })
    else axis.colors.push(color)
  }
  return axes
}

/** A box on screen, in window pixels. */
interface Box {
  top: number
  left: number
  right: number
  bottom: number
}

/** The room kept between Axes and lines and the trend, or the window's edge. */
const BESIDE_GAP = 8

/** A width and a height, in pixels. */
interface Size {
  width: number
  height: number
}

/**
 * Where Axes and lines opens, `panel` big: left of the floating `trend` when
 * the window has room there, right of it when not, and under its `button`,
 * level with its right edge, beside a trend that floats nowhere or has no
 * room on either side, in a window of `room`; above the button when the
 * window has room there and none under it. Otherwise it moves up as far as
 * it takes to end inside the window, and no higher than the window's top.
 */
export const settingsPlace = (
  button: Box,
  trend: Box | undefined,
  panel: Size,
  room: Size
): { top: number; left: number } => {
  const inside = (top: number): number =>
    Math.max(BESIDE_GAP, Math.min(top, room.height - BESIDE_GAP - panel.height))
  if (trend !== undefined && trend.left - BESIDE_GAP - panel.width >= BESIDE_GAP)
    return { top: inside(trend.top), left: trend.left - BESIDE_GAP - panel.width }
  if (trend !== undefined && trend.right + BESIDE_GAP + panel.width <= room.width - BESIDE_GAP)
    return { top: inside(trend.top), left: trend.right + BESIDE_GAP }
  const under = button.bottom + BESIDE_GAP
  const above = button.top - BESIDE_GAP - panel.height
  const fitsUnder = under + panel.height <= room.height - BESIDE_GAP
  const top = fitsUnder || above < BESIDE_GAP ? inside(under) : above
  return { top, left: button.right - panel.width }
}

/** A stretch of time a trend was paused, picked, zoomed or panned to, which stops it following the log. */
export interface TrendView {
  from: number
  to: number
  /**
   * The range button that stays pressed: the range, paused over it, or the
   * calendar, which picked it. A zoom or a pan leaves a stretch with none.
   */
  pressed?: 'range' | 'calendar'
}

/** A trend that follows the log over its own length rather than the range's. */
export interface TrendFollow {
  length: number
}

export const isFollow = (view: TrendView | TrendFollow): view is TrendFollow => 'length' in view

/**
 * The stretch a trend shows from `from` to `to`, and what the log holds from
 * `start` to `end`: from its oldest sample, or from `from` while it is empty,
 * to now while it runs and to where it last stopped otherwise. Held, the
 * trend shows its view; following, the range or the follow's own length up to
 * the end, and the whole log from its oldest sample, or the shortest range
 * while the log is empty.
 */
export const shownStretch = (
  view: TrendView | TrendFollow | undefined,
  range: TrendRangeId,
  log: { running: boolean; oldest: number | undefined; lastEnd: number | undefined },
  now: number
): { from: number; to: number; start: number; end: number } => {
  const held = view === undefined || isFollow(view) ? undefined : view
  const span = view !== undefined && isFollow(view) ? view.length : TREND_SPANS[range]
  const end = log.running ? now : (log.lastEnd ?? now)
  const to = held?.to ?? end
  const from =
    held?.from ?? (Number.isFinite(span) ? to - span : (log.oldest ?? to - TREND_SPANS['10m']))
  return { from, to, start: log.oldest ?? from, end }
}

/** The shortest stretch a trend zooms in to. */
export const SHORTEST_VIEW_MS = 1000

/**
 * The view a zoom or a pan to `from` and `to` leaves, inside `bound`: what the
 * log holds, up to now. A stretch that reaches the end of what the log holds
 * follows the range again once it spans the range or more, and while the log
 * runs a shorter one follows the log over its own length.
 */
export const viewWithin = (
  from: number,
  to: number,
  bound: TrendView,
  span: number,
  running: boolean
): TrendView | TrendFollow | undefined => {
  const length = Math.min(Math.max(to - from, SHORTEST_VIEW_MS), bound.to - bound.from)
  const start = Math.min(Math.max(from, bound.from), bound.to - length)
  const view = { from: start, to: start + length }
  if (view.to < bound.to) return view
  if (length >= Math.min(span, bound.to - bound.from)) return undefined
  return running ? { length } : view
}

/** A time as the calendar picks it, to the second. */
export const toSecond = (time: number): number => Math.floor(time / 1000) * 1000

/**
 * The stretch the calendar picks from `from` to `to`, inside what the log
 * holds from `start` to `end`, a second long at least; none outside it. The
 * calendar picks to the second, so a `from` in the second of `start` starts
 * at `start`.
 */
export const pickedStretch = (
  from: number,
  to: number,
  start: number,
  end: number
): TrendView | undefined => {
  if (from < toSecond(start) || to > end) return undefined
  const clamped = Math.max(from, start)
  if (to - clamped < SHORTEST_VIEW_MS) return undefined
  return { from: clamped, to, pressed: 'calendar' }
}

/**
 * A picked stretch as the header names it: "14:05 to 14:20, 29 Sep", with
 * the seconds when either end has some, and each end's date when they fall
 * on two days.
 */
export const stretchLabel = (from: number, to: number): string => {
  const start = DateTime.fromMillis(from)
  const end = DateTime.fromMillis(to)
  const time = start.second === 0 && end.second === 0 ? 'HH:mm' : 'HH:mm:ss'
  if (start.hasSame(end, 'day'))
    return `${start.toFormat(time)} to ${end.toFormat(time)}, ${start.toFormat('d LLL')}`
  return `${start.toFormat(`d LLL ${time}`)} to ${end.toFormat(`d LLL ${time}`)}`
}

/** How much a notch of the wheel zooms: in by this, and out by its inverse. */
export const WHEEL_ZOOM = 0.8

/** The stretch a zoom by `factor` around `at` leaves of `from` to `to`. */
export const zoomAround = (from: number, to: number, at: number, factor: number): TrendView => ({
  from: at - (at - from) * factor,
  to: at + (to - at) * factor
})

/**
 * The points of a window with those of the answer that went on from it.
 * Main answers the stretch the last answer ended in again, with only the
 * samples since, so with a `step` that stretch is stepped again out of both,
 * and it keeps one lowest, highest and newest.
 */
export const mergeSteps = (
  held: readonly LogPoint[],
  fresh: readonly LogPoint[],
  step: number | undefined
): LogPoint[] => {
  const [first] = fresh
  if (step === undefined || first === undefined) return [...held, ...fresh]
  const stretch = Math.floor(first.time / step)
  const open = held.findIndex(({ time }) => Math.floor(time / step) >= stretch)
  if (open === -1) return [...held, ...fresh]
  return [...held.slice(0, open), ...inSteps([...held.slice(open), ...fresh], step)]
}

/**
 * Each line's value at `index` of a table `uPlot.join` made: the last one at
 * or before it, a gap as null, and nothing before the line's first sample.
 * The join leaves a line undefined where only another line has a sample.
 */
export const valuesAt = (data: uPlot.AlignedData, index: number): (number | null | undefined)[] =>
  data.slice(1).map((column) => {
    for (let at = index; at >= 0; at--) {
      const value = column[at]
      if (value !== undefined) return value
    }
    return undefined
  })

/**
 * The last index of `times` at or before `time`, none before the first. A
 * readout asks it on every move of the cursor, over the few thousand samples
 * a window holds.
 */
export const indexAt = (times: ArrayLike<number>, time: number): number | undefined => {
  const index = Array.from(times).findLastIndex((each) => each <= time)
  return index === -1 ? undefined : index
}

/** A number as the trend's figures write it: as the value came, at most six decimals. */
export const figure = (value: number | null | undefined): string =>
  value === undefined || value === null ? '–' : String(Math.round(value * 1e6) / 1e6)

/** Which part of the navigator's window a press holds. */
export type Grip = 'window' | 'from' | 'to'

/** How many pixels from an edge of the navigator's window a press holds that edge. */
export const EDGE = 6

/**
 * What a press `x` pixels into a window `width` wide holds: an edge near
 * either side, and the window between them. A window too narrow for two
 * edges and a middle is only moved.
 */
export const gripAt = (x: number, width: number): Grip => {
  if (width <= 4 * EDGE) return 'window'
  return x <= EDGE ? 'from' : x >= width - EDGE ? 'to' : 'window'
}

/** How far from the cursor the readout sits, and how wide it is. */
const READOUT_GAP = 12
export const READOUT_WIDTH = 220

/** How tall a row of the readout is, and what its box adds around its rows. */
export const READOUT_ROW = 21
export const READOUT_PADDING = 16

/**
 * Where a readout `tall` pixels high goes in a chart `width` by `height`:
 * right of the cursor, or left of it where the right has no room; from just
 * above the cursor down in the upper half, and ending above it in the lower.
 * It never leaves the chart on any side a chart that tall can hold it in.
 */
export const readoutPlace = (
  left: number,
  top: number,
  width: number,
  height: number,
  tall: number
): { left: number; top: number } => {
  const right = left + READOUT_GAP
  const x = Math.max(0, right + READOUT_WIDTH > width ? left - READOUT_GAP - READOUT_WIDTH : right)
  const y = top > height / 2 ? top - READOUT_GAP - tall : top - READOUT_GAP
  return { left: x, top: Math.min(Math.max(0, y), Math.max(0, height - tall)) }
}

/** A stretch a bit was on. */
export interface LaneSpan {
  start: number
  end: number
}

/**
 * The stretches `isOn` holds for a register's samples: from a sample that is
 * on to the next sample, or to where its run ended, and the last up to `end`.
 * A failed read is neither, and stretches that meet are one.
 */
export const laneSpans = (
  points: readonly LogPoint[],
  runEnds: readonly number[],
  isOn: (value: number) => boolean,
  end: number
): LaneSpan[] => {
  // A run's end sorts after a sample taken at the same moment.
  const events = [
    ...points.map((point) => ({ time: point.time, order: 0, point })),
    ...runEnds.map((time) => ({ time, order: 1, point: undefined }))
  ].sort((a, b) => a.time - b.time || a.order - b.order)
  const spans: LaneSpan[] = []
  let open: number | undefined
  const close = (at: number): void => {
    if (open === undefined) return
    const last = spans.at(-1)
    if (last?.end === open) last.end = at
    else spans.push({ start: open, end: at })
    open = undefined
  }
  for (const { time, point } of events) {
    close(time)
    if (point !== undefined && point.error === undefined && isOn(point.value)) open = time
  }
  close(end)
  return spans
}

/** The newest sample at or before `time`, which a lane reads at the cursor. */
export const pointAt = (points: readonly LogPoint[], time: number): LogPoint | undefined => {
  let low = 0
  let high = points.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const point = points[middle]
    if (point !== undefined && point.time <= time) low = middle + 1
    else high = middle
  }
  return points[low - 1]
}

/**
 * A lane's sample at `time`: the newest at or before it, and none once its
 * run ended between that sample and `time`, where the lane's bar is dark.
 */
export const laneAt = (
  points: readonly LogPoint[],
  runEnds: readonly number[],
  time: number
): LogPoint | undefined => {
  const point = pointAt(points, time)
  if (point === undefined) return undefined
  return runEnds.some((end) => end >= point.time && end <= time) ? undefined : point
}

/** Whether bit `bit` of a bitmap's word is on, as its settings say: inverted, it is on when clear. */
export const bitOn = (word: number, bit: number, invert: boolean | undefined): boolean =>
  (((word >> bit) & 1) === 1) !== (invert === true)

/**
 * The bits of a bitmap its lane opens into: every bit its settings name or
 * mark, and every bit that was set in a sample, in order.
 */
export const bitsOf = (bitMap: BitMapConfig | undefined, points: readonly LogPoint[]): number[] => {
  // A failed read's value is NaN, which a bitwise or takes as 0.
  const seen = points.reduce((word, { value }) => word | value, 0)
  return Array.from({ length: 16 }, (_, bit) => bit).filter(
    (bit) => bitMap?.[String(bit)] !== undefined || ((seen >> bit) & 1) === 1
  )
}

/** A register that logs, as the trend's picker lists it. */
export interface LoggedRegister {
  type: RegisterType
  address: number
}

/** The registers of `unit` that log, by register type and then by address. */
export const loggedRegisters = (unit: ClientUnit): LoggedRegister[] =>
  RegisterTypeSchema.options.flatMap((type) =>
    Object.entries(unit.registerMapping[type])
      .filter(([, mapValue]) => isLogged(type, mapValue))
      .map(([address]) => ({ type, address: Number(address) }))
      .sort((a, b) => a.address - b.address)
  )

export const DEFAULT_TREND_SETTINGS: TrendSettings = { time: 'clock', drawAs: 'lines' }

/**
 * A stretch of time as the time axis writes it since the log's start: 1:05:09,
 * or 5:09, and with a minus sign before it, over the hatch.
 */
export const sinceText = (millis: number): string => {
  const whole = Math.round(millis / 1000)
  const seconds = Math.abs(whole)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const rest = String(seconds % 60).padStart(2, '0')
  const text =
    hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
  return whole < 0 ? `-${text}` : text
}

/**
 * The range two typed fields hold: both finite numbers, the minimum below the
 * maximum. The field takes an exponent, and `1e999` is Infinity.
 */
export const rangeOf = (minText: string, maxText: string): AxisRange | undefined => {
  if (minText.trim() === '' || maxText.trim() === '') return undefined
  const min = Number(minText)
  const max = Number(maxText)
  return Number.isFinite(min) && Number.isFinite(max) && min < max ? { min, max } : undefined
}

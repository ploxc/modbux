import { inSteps, LogPoint, LogRun, LogStopReason } from '@shared'

/** The ranges a trend picks from, in the order it offers them. */
export const TREND_RANGES = [
  { id: '10m', label: '10 min' },
  { id: '1h', label: '1 h' },
  { id: '8h', label: '8 h' },
  { id: 'log', label: 'Whole log' }
] as const
export type TrendRangeId = (typeof TREND_RANGES)[number]['id']

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

/** The newest value a trend holds, and its lowest and highest. */
export const trendSummary = (
  values: (number | null)[]
): { last: number | undefined; min: number | undefined; max: number | undefined } => {
  const numbers = values.filter((value): value is number => value !== null)
  return {
    last: numbers.at(-1),
    min: numbers.length === 0 ? undefined : Math.min(...numbers),
    max: numbers.length === 0 ? undefined : Math.max(...numbers)
  }
}

/** A stretch of time a trend was zoomed or panned to, which stops it following the log. */
export interface TrendView {
  from: number
  to: number
}

/** The shortest stretch a trend zooms in to. */
const SHORTEST_VIEW_MS = 1000

/**
 * The view a zoom or a pan to `from` and `to` leaves, inside `bound`: what the
 * log holds, up to now. None, which follows the range again, once it reaches
 * the end of what the log holds and spans the range or more.
 */
export const viewWithin = (
  from: number,
  to: number,
  bound: TrendView,
  span: number
): TrendView | undefined => {
  const length = Math.min(Math.max(to - from, SHORTEST_VIEW_MS), bound.to - bound.from)
  const start = Math.min(Math.max(from, bound.from), bound.to - length)
  const view = { from: start, to: start + length }
  return view.to >= bound.to && length >= Math.min(span, bound.to - bound.from) ? undefined : view
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

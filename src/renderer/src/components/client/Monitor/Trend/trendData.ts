import { LogPoint } from '@shared'

/** How far back a mini trend reaches. */
export const TREND_WINDOW_MS = 10 * 60 * 1000

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

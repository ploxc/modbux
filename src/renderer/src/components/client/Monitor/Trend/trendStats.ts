import { LogPoint } from '@shared'
import { laneSpans } from './trendData'

/** A line's numbers over a stretch. */
export interface LineStats {
  avg: number
  min: number
  max: number
  median: number
  last: number
  /** The last value less the first. */
  delta: number
  /** How many samples read. */
  n: number
}

/**
 * A line's numbers over the samples that read in a stretch, in time order:
 * the mean of the samples, the lowest, the highest, the median, the last, the
 * last less the first, and how many there were; none without a sample.
 */
export const lineStats = (
  samples: readonly { time: number; value: number }[]
): LineStats | undefined => {
  const [first, ...rest] = samples
  if (first === undefined) return undefined
  const values = samples.map(({ value }) => value)
  const last = rest.at(-1) ?? first
  const sorted = [...values].sort((a, b) => a - b)
  const half = Math.floor(sorted.length / 2)
  const middle =
    sorted.length % 2 === 1 ? sorted.slice(half, half + 1) : sorted.slice(half - 1, half + 1)
  const sum = (each: number[]): number => each.reduce((total, value) => total + value, 0)
  return {
    avg: sum(values) / values.length,
    // Spread into Math.min would run out of stack on a long stretch.
    min: values.reduce((low, value) => Math.min(low, value)),
    max: values.reduce((high, value) => Math.max(high, value)),
    median: sum(middle) / middle.length,
    last: last.value,
    delta: last.value - first.value,
    n: values.length
  }
}

/** A bit's or a bitmap's numbers over a stretch. */
export interface LaneStats {
  /** The share of the stretch from its first sample that it was on, 0 to 1. */
  share: number
  /** How often it went from on to off or back, between two samples that read. */
  switches: number
  /** Whether the last sample that read was on. */
  last: boolean
  /** How many samples read. */
  n: number
}

/**
 * A lane's numbers over the samples of a stretch from `from` to `to`, in time
 * order: the share of the stretch it was on, weighed by time as its lane
 * lights it, from its first sample on, because the log says nothing of it
 * before that; how often it switched; its last state; and how many samples
 * read. A failed read counts in nothing, and ends what was on as the lane
 * does. None without a sample that read.
 */
export const laneStats = (
  points: readonly LogPoint[],
  runEnds: readonly number[],
  isOn: (value: number) => boolean,
  from: number,
  to: number
): LaneStats | undefined => {
  const read = points.filter(({ time, error }) => error === undefined && time >= from && time <= to)
  const [first] = read
  if (first === undefined) return undefined
  const states = read.map(({ value }) => isOn(value))
  const last = states.at(-1) === true
  const switches = states.filter((state, index) => index > 0 && state !== states[index - 1]).length
  const length = to - first.time
  if (length <= 0) return { share: last ? 1 : 0, switches, last, n: read.length }
  const inStretch = points.filter(({ time }) => time >= from && time <= to)
  const on = laneSpans(inStretch, runEnds, isOn, to).reduce(
    // A run that ends after the stretch holds its last span past `to`.
    (total, { start, end }) => total + Math.min(end, to) - start,
    0
  )
  return { share: on / length, switches, last, n: read.length }
}

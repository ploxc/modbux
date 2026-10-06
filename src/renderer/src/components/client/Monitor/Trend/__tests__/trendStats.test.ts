import { describe, expect, it } from 'vitest'
import type { LogPoint } from '@shared'
import { laneStats, lineStats } from '../trendStats'

const sample = (time: number, value: number): { time: number; value: number } => ({ time, value })
const point = (time: number, value: number, error?: string): LogPoint => ({ time, value, error })
const isOn = (value: number): boolean => value !== 0

describe('lineStats', () => {
  it('answers the mean, the extremes, the last and the last less the first', () => {
    expect(lineStats([sample(1, 4), sample(2, 1), sample(3, 7)])).toEqual({
      avg: 4,
      min: 1,
      max: 7,
      median: 4,
      last: 7,
      delta: 3,
      n: 3
    })
  })

  it('takes the median of an even count as the mean of the middle two', () => {
    expect(lineStats([sample(1, 10), sample(2, 1), sample(3, 4), sample(4, 3)])?.median).toBe(3.5)
  })

  it('takes the middle of an odd count, not the middle of the samples in time', () => {
    expect(lineStats([sample(1, 9), sample(2, 1), sample(3, 5)])?.median).toBe(5)
  })

  it('answers a negative change for a line that fell', () => {
    expect(lineStats([sample(1, 8), sample(2, 9), sample(3, 2)])?.delta).toBe(-6)
  })

  it('answers one sample as its own every figure, and a change of none', () => {
    expect(lineStats([sample(1, 5)])).toEqual({
      avg: 5,
      min: 5,
      max: 5,
      median: 5,
      last: 5,
      delta: 0,
      n: 1
    })
  })

  it('answers nothing for no sample', () => {
    expect(lineStats([])).toBeUndefined()
  })
})

describe('laneStats', () => {
  it('weighs the share on by time, from the first sample to the end of the stretch', () => {
    // On from 10 to 30, off from 30 to 50: half of what the log says of it.
    expect(laneStats([point(10, 1), point(30, 0)], [], isOn, 0, 50)).toEqual({
      share: 0.5,
      switches: 1,
      last: false,
      n: 2
    })
  })

  it('counts a bit on at the start and at the end of the stretch', () => {
    expect(laneStats([point(0, 1), point(10, 0), point(20, 1)], [], isOn, 0, 40)).toEqual({
      share: 0.75,
      switches: 2,
      last: true,
      n: 3
    })
  })

  it('ends what was on where its run ended inside the stretch', () => {
    expect(laneStats([point(0, 1)], [10], isOn, 0, 40)?.share).toBe(0.25)
  })

  it('counts a run that ends after the stretch up to the end of the stretch', () => {
    expect(laneStats([point(0, 1)], [100], isOn, 0, 40)?.share).toBe(1)
  })

  it('counts a failed read in nothing, and ends what was on at it', () => {
    expect(
      laneStats([point(0, 1), point(10, NaN, 'Timed out'), point(30, 1)], [], isOn, 0, 40)
    ).toEqual({
      share: 0.5,
      switches: 0,
      last: true,
      n: 2
    })
  })

  it('leaves out samples outside the stretch', () => {
    expect(laneStats([point(0, 1), point(20, 0), point(60, 1)], [], isOn, 10, 40)).toEqual({
      share: 0,
      switches: 0,
      last: false,
      n: 1
    })
  })

  it('answers a stretch that ends at its one sample by that sample', () => {
    expect(laneStats([point(40, 1)], [], isOn, 0, 40)).toEqual({
      share: 1,
      switches: 0,
      last: true,
      n: 1
    })
  })

  it('answers nothing without a sample that read', () => {
    expect(laneStats([point(5, NaN, 'Timed out')], [], isOn, 0, 40)).toBeUndefined()
  })
})

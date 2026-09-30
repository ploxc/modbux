import { describe, expect, it, vi } from 'vitest'
import { LogSeries, LogSetting } from '@shared'
import { SessionLog } from '../sessionLog'

const holding0: LogSeries = { unit: 'unit-a', type: 'holding_registers', address: 0 }
const coil3: LogSeries = { unit: 'unit-a', type: 'coils', address: 3 }
const poll: LogSetting = { mode: 'poll' }
const change = (deadband: number): LogSetting => ({ mode: 'change', deadband })

const running = (capacity?: number, onOverwriteStart = vi.fn()): SessionLog => {
  const log = new SessionLog(onOverwriteStart, capacity)
  log.start(0)
  return log
}

const values = (log: SessionLog): number[] => [...log.samples()].map(({ value }) => value)

describe('SessionLog', () => {
  it('keeps every read of a register that logs on every poll', () => {
    const log = running()
    log.record(holding0, poll, 1, 5, undefined)
    log.record(holding0, poll, 2, 5, undefined)
    log.record(coil3, poll, 2, 1, undefined)

    expect([...log.samples()]).toEqual([
      { ...holding0, time: 1, value: 5, error: undefined },
      { ...holding0, time: 2, value: 5, error: undefined },
      { ...coil3, time: 2, value: 1, error: undefined }
    ])
  })

  it('keeps a change past the deadband, and not one inside it or on it', () => {
    const log = running()
    log.record(holding0, change(2), 1, 10, undefined)
    log.record(holding0, change(2), 2, 12, undefined)
    log.record(holding0, change(2), 3, 8, undefined)
    log.record(holding0, change(2), 4, 12.5, undefined)
    log.record(holding0, change(2), 5, 11, undefined)
    log.record(holding0, change(2), 6, 5.5, undefined)

    expect(values(log)).toEqual([10, 12.5, 5.5])
  })

  it('measures a change against the last value kept, not the last value read', () => {
    const log = running()
    for (const [time, value] of [10, 11, 12, 13].entries()) {
      log.record(holding0, change(2), time, value, undefined)
    }
    expect(values(log)).toEqual([10, 13])
  })

  it('measures a change against the last sample, when a register logged on every poll in between', () => {
    const log = running()
    log.record(holding0, change(2), 1, 10, undefined)
    log.record(holding0, poll, 2, 20, undefined)
    log.record(holding0, change(2), 3, 11, undefined)
    log.record(holding0, change(2), 4, 12, undefined)

    expect(values(log)).toEqual([10, 20, 11])
  })

  it('measures a change inside the deadband of the last poll sample as no change', () => {
    const log = running()
    log.record(holding0, change(2), 1, 10, undefined)
    log.record(holding0, poll, 2, 20, undefined)
    log.record(holding0, change(2), 3, 21, undefined)

    expect(values(log)).toEqual([10, 20])
  })

  it('keeps a failed read once per error, and the value that comes back after it', () => {
    const log = running()
    log.record(holding0, change(0), 1, 10, undefined)
    log.record(holding0, change(0), 2, 0, 'Timed out')
    log.record(holding0, change(0), 3, 0, 'Timed out')
    log.record(holding0, change(0), 4, 0, 'Illegal data address')
    log.record(holding0, change(0), 5, 10, undefined)

    expect([...log.samples()].map(({ time, error }) => [time, error])).toEqual([
      [1, undefined],
      [2, 'Timed out'],
      [4, 'Illegal data address'],
      [5, undefined]
    ])
  })

  it('keeps the first read of a run in change mode, whatever the run before it kept', () => {
    const log = running()
    log.record(holding0, change(2), 1, 10, undefined)
    log.stop(2, 'poll stopped')
    log.start(3)
    log.record(holding0, change(2), 4, 10, undefined)

    expect(values(log)).toEqual([10, 10])
  })

  it('keeps nothing before it starts or after it stops, and says why it stopped', () => {
    const log = new SessionLog(vi.fn())
    log.record(holding0, poll, 1, 5, undefined)
    log.start(2)
    log.record(holding0, poll, 3, 6, undefined)
    log.stop(4, 'disconnected')
    log.record(holding0, poll, 5, 7, undefined)

    expect(values(log)).toEqual([6])
    expect(log.status()).toMatchObject({
      running: false,
      samples: 1,
      runs: [{ start: 2, end: 4, reason: 'disconnected' }]
    })
  })

  it('keeps what it holds when it starts again, and nothing once it is cleared', () => {
    const log = running()
    log.record(holding0, poll, 1, 5, undefined)
    log.stop(2, 'log stopped')

    log.start(3)
    log.record(holding0, poll, 4, 6, undefined)
    expect(values(log)).toEqual([5, 6])
    expect(log.status().runs).toHaveLength(2)

    log.clear()
    expect(values(log)).toEqual([])
    expect(log.status()).toMatchObject({ running: false, samples: 0, runs: [] })
  })

  it('overwrites the oldest once full, counts what it overwrote, and says so once', () => {
    const onOverwriteStart = vi.fn()
    const log = running(3, onOverwriteStart)
    for (const value of [1, 2, 3, 4, 5]) log.record(holding0, poll, value * 10, value, undefined)

    expect(values(log)).toEqual([3, 4, 5])
    expect(log.status()).toMatchObject({ samples: 3, capacity: 3, overwritten: 2, oldest: 30 })
    expect(onOverwriteStart).toHaveBeenCalledTimes(1)
  })

  it('hands its samples back in order when it has wrapped exactly once round', () => {
    const log = running(3)
    for (const value of [1, 2, 3, 4, 5, 6]) log.record(holding0, poll, value, value, undefined)
    expect(values(log)).toEqual([4, 5, 6])
  })

  it('grows past its first slots with every sample kept in order', () => {
    const log = running(5000)
    for (let value = 0; value < 2500; value++) log.record(holding0, poll, value, value, undefined)

    const kept = values(log)
    expect(kept).toHaveLength(2500)
    expect(kept.every((value, index) => value === index)).toBe(true)
    expect(log.status().overwritten).toBe(0)
  })

  it('wraps at its capacity after growing, when the capacity is not a doubling of its first slots', () => {
    const log = running(1500)
    for (let value = 0; value < 1600; value++) log.record(holding0, poll, value, value, undefined)

    const kept = values(log)
    expect(kept).toHaveLength(1500)
    expect(kept[0]).toBe(100)
    expect(kept.at(-1)).toBe(1599)
  })

  it('keeps the newest samples when it shrinks, and counts the rest as overwritten', () => {
    const log = running(10)
    for (const value of [1, 2, 3, 4, 5]) log.record(holding0, poll, value, value, undefined)

    log.setCapacity(3)
    expect(values(log)).toEqual([3, 4, 5])
    expect(log.status()).toMatchObject({ capacity: 3, samples: 3, overwritten: 2 })

    log.record(holding0, poll, 6, 6, undefined)
    expect(values(log)).toEqual([4, 5, 6])
  })

  it('says it overwrites when a shrink drops samples, and only once after that', () => {
    const onOverwriteStart = vi.fn()
    const log = running(10, onOverwriteStart)
    for (const value of [1, 2, 3, 4, 5]) log.record(holding0, poll, value, value, undefined)

    log.setCapacity(3)
    expect(onOverwriteStart).toHaveBeenCalledTimes(1)

    log.record(holding0, poll, 6, 6, undefined)
    log.setCapacity(2)
    expect(onOverwriteStart).toHaveBeenCalledTimes(1)
  })

  it('says nothing when a shrink drops no sample, and says it once the smaller log wraps', () => {
    const onOverwriteStart = vi.fn()
    const log = running(10, onOverwriteStart)
    for (const value of [1, 2, 3]) log.record(holding0, poll, value, value, undefined)

    log.setCapacity(3)
    expect(onOverwriteStart).not.toHaveBeenCalled()

    log.record(holding0, poll, 4, 4, undefined)
    expect(onOverwriteStart).toHaveBeenCalledTimes(1)
  })

  it('keeps every sample when it grows, in order, after it had wrapped', () => {
    const log = running(3)
    for (const value of [1, 2, 3, 4, 5]) log.record(holding0, poll, value, value, undefined)

    log.setCapacity(1500)
    for (const value of [6, 7]) log.record(holding0, poll, value, value, undefined)
    expect(values(log)).toEqual([3, 4, 5, 6, 7])
    expect(log.status()).toMatchObject({ capacity: 1500, overwritten: 2 })
  })

  describe('the series it holds', () => {
    const holding1: LogSeries = { unit: 'unit-b', type: 'holding_registers', address: 1 }

    it('lists every series it holds a sample of, in the order each was first kept', () => {
      const log = running()
      log.record(coil3, poll, 1, 1, undefined)
      log.record(holding0, poll, 2, 5, undefined)
      log.record(coil3, poll, 3, 0, 'Timed out')

      expect(log.series()).toEqual([coil3, holding0])
    })

    it('drops a series once its last sample is overwritten, and keeps one with a sample left', () => {
      const log = running(3)
      log.record(holding0, poll, 1, 5, undefined)
      log.record(coil3, poll, 2, 1, undefined)
      log.record(holding1, poll, 3, 7, undefined)
      log.record(coil3, poll, 4, 0, undefined)

      expect(log.series()).toEqual([coil3, holding1])
    })

    it('drops a series a shrink leaves no sample of, and keeps the rest', () => {
      const log = running(10)
      log.record(holding0, poll, 1, 5, undefined)
      log.record(coil3, poll, 2, 1, undefined)
      log.record(holding1, poll, 3, 7, undefined)

      log.setCapacity(2)
      expect(log.series()).toEqual([coil3, holding1])
    })

    it('lists nothing once cleared, and what it keeps after', () => {
      const log = running()
      log.record(holding0, poll, 1, 5, undefined)
      log.clear()
      expect(log.series()).toEqual([])

      log.start(2)
      log.record(coil3, poll, 3, 1, undefined)
      expect(log.series()).toEqual([coil3])
    })
  })

  describe('a page', () => {
    const all = (): boolean => true

    it('hands back what it takes, and where to go on from', () => {
      const log = running()
      for (const value of [1, 2, 3, 4, 5]) log.record(holding0, poll, value, value, undefined)

      const first = log.page(0, all, 2)
      expect(first.samples.map(({ value }) => value)).toEqual([1, 2])
      const second = log.page(first.next ?? -1, all, 2)
      expect(second.samples.map(({ value }) => value)).toEqual([3, 4])
      const last = log.page(second.next ?? -1, all, 2)
      expect(last.samples.map(({ value }) => value)).toEqual([5])
      expect(last.next).toBeUndefined()
    })

    it('reads past what it does not take', () => {
      const log = running()
      for (const value of [1, 2, 3, 4, 5]) {
        log.record(value % 2 === 0 ? coil3 : holding0, poll, value, value, undefined)
      }
      const page = log.page(0, ({ type }) => type === 'coils', 10)
      expect(page.samples.map(({ value }) => value)).toEqual([2, 4])
    })

    it('starts at the oldest when the sequence asked for was overwritten, and keeps its place as the log wraps', () => {
      const log = running(3)
      for (const value of [1, 2, 3, 4, 5]) log.record(holding0, poll, value, value, undefined)
      const page = log.page(0, all, 1)
      expect(page.samples.map(({ value }) => value)).toEqual([3])

      log.record(holding0, poll, 6, 6, undefined)
      const next = log.page(page.next ?? -1, all, 10)
      expect(next.samples.map(({ value }) => value)).toEqual([4, 5, 6])
    })

    it('keeps its sequences when the size changes', () => {
      const log = running(10)
      for (const value of [1, 2, 3, 4, 5]) log.record(holding0, poll, value, value, undefined)
      const page = log.page(0, all, 3)
      log.setCapacity(4)
      expect(log.page(page.next ?? -1, all, 10).samples.map(({ value }) => value)).toEqual([4, 5])
    })
  })

  describe('window', () => {
    it('answers one series from a time on, in order, with its errors', () => {
      const log = running()
      log.record(holding0, poll, 1, 10, undefined)
      log.record(coil3, poll, 1, 1, undefined)
      log.record(holding0, poll, 2, 11, undefined)
      log.record(holding0, poll, 3, Number.NaN, 'Timed out')
      log.record(coil3, poll, 3, 0, undefined)
      log.record(holding0, poll, 4, 13, undefined)

      expect(log.window(holding0, 2, 0)).toEqual({
        points: [
          { time: 2, value: 11, error: undefined },
          { time: 3, value: Number.NaN, error: 'Timed out' },
          { time: 4, value: 13, error: undefined }
        ],
        end: 6
      })
    })

    it('answers only what came after the sequence asked from', () => {
      const log = running()
      for (const time of [1, 2, 3, 4]) log.record(holding0, poll, time, time * 10, undefined)

      const first = log.window(holding0, 0, 0)
      log.record(holding0, poll, 5, 50, undefined)
      const next = log.window(holding0, 0, first.end)

      expect(first.end).toBe(4)
      expect(next).toEqual({ points: [{ time: 5, value: 50, error: undefined }], end: 5 })
    })

    it('reads a log that wrapped, from its oldest sample', () => {
      const log = running(4)
      for (const time of [1, 2, 3, 4, 5, 6]) log.record(holding0, poll, time, time, undefined)

      expect(log.window(holding0, 0, 0).points.map(({ time }) => time)).toEqual([3, 4, 5, 6])
      expect(log.window(holding0, 5, 0).points.map(({ time }) => time)).toEqual([5, 6])
    })

    it('answers nothing for a series the log never held', () => {
      const log = running()
      log.record(holding0, poll, 1, 10, undefined)

      expect(log.window(coil3, 0, 0)).toEqual({ points: [], end: 1 })
    })
  })
})

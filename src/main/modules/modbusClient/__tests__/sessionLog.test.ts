import { describe, expect, it, vi } from 'vitest'
import { LogSetting } from '@shared'
import { LogSeries, SessionLog } from '../sessionLog'

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
})

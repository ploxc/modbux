// @vitest-environment happy-dom
//
// The batcher is a debounce with a ceiling. Without the ceiling a stream whose
// gaps are all under 50 ms clears the pending timeout every time, and the grid
// it feeds stops moving for as long as the stream runs.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ServerDelayedSetter } from '../server.zustand.helpers'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** A setter that records what each flush handed it. */
const recordingSetter = (): {
  setter: ServerDelayedSetter<number, string>
  flushes: string[][]
} => {
  const flushes: string[][] = []
  const setter = new ServerDelayedSetter<number, string>({
    maxCount: 3,
    set: (parameters): void => {
      flushes.push(Array.isArray(parameters) ? parameters : [parameters])
    }
  })
  return { setter, flushes }
}

describe('ServerDelayedSetter', () => {
  it('flushes on the timer when the stream leaves a gap', () => {
    const { setter, flushes } = recordingSetter()

    setter.setParameter('0', 'first')
    setter.trigger()

    expect(flushes).toEqual([])

    vi.advanceTimersByTime(50)

    expect(flushes).toEqual([['first']])
  })

  it('flushes on the ceiling when the stream leaves none', () => {
    const { setter, flushes } = recordingSetter()

    // No timer advance at all, which is the burst the ceiling is for.
    for (let index = 0; index < 10; index++) {
      setter.setParameter(String(index), `value ${index}`)
      setter.trigger()
    }

    expect(flushes.length).toBeGreaterThan(0)
    expect(flushes[0]).toContain('value 0')
  })

  it('counts from zero again after a flush', () => {
    const { setter, flushes } = recordingSetter()

    for (let index = 0; index < 5; index++) {
      setter.setParameter(String(index), `first ${index}`)
      setter.trigger()
    }
    const afterFirstBurst = flushes.length

    for (let index = 0; index < 5; index++) {
      setter.setParameter(String(index), `second ${index}`)
      setter.trigger()
    }

    expect(flushes.length).toBeGreaterThan(afterFirstBurst)
  })

  it('hands the pending value back before it is flushed', () => {
    const { setter } = recordingSetter()

    setter.setValue('7', 42)

    expect(setter.getValue('7')).toBe(42)
  })
})

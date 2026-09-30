// @vitest-environment happy-dom
//
// The trend asks main for each register's window, and while live asks again
// every second from the end of the last answer, one round after the other.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The live store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { act, renderHook } from '@testing-library/react'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { defaultClientState, emptyLogStatus, type ClientLogWindow, type LogWindow } from '@shared'
import { useLogWindows, windowStart } from '../useLogWindows'
import type { DrawnEntry } from '../trendPanel.zustand'

const entry = (address: number): DrawnEntry => ({
  uuid: 'client-a',
  unit: 'unit-1',
  type: 'holding_registers',
  address,
  color: '#81bc57'
})
const NOW = 1_000_000_000
const TEN_MINUTES = 600_000

let asked: ClientLogWindow[] = []
let answers: Record<number, LogWindow[]> = {}

/** The client's log, as main last reported it: its oldest sample. */
const logHolds = (oldest: number | undefined): void =>
  useLiveZustand.getState().setClientState('client-a', {
    ...defaultClientState,
    log: { ...emptyLogStatus(), oldest }
  })

let api: unknown

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  asked = []
  answers = {}
  logHolds(0)
  api = window.api
  ;(window as unknown as { api: unknown }).api = {
    getLogWindow: (query: ClientLogWindow): Promise<LogWindow | undefined> => {
      asked.push(query)
      return Promise.resolve(answers[query.series.address]?.shift())
    }
  }
})

afterEach(() => {
  vi.useRealTimers()
  ;(window as unknown as { api: unknown }).api = api
})

const settle = async (): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe('useLogWindows', () => {
  it('asks each register from the end of its last answer, a second apart, while live', async () => {
    answers[0] = [
      { points: [{ time: NOW - 5, value: 1, error: undefined }], end: 10 },
      { points: [{ time: NOW + 500, value: 2, error: undefined }], end: 12 }
    ]
    answers[1] = [
      { points: [], end: 10 },
      { points: [], end: 10 }
    ]
    const entries = [entry(0), entry(1)]
    const { result } = renderHook(() =>
      useLogWindows(entries, { live: true, span: TEN_MINUTES, until: undefined, started: true })
    )
    await settle()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(asked.map(({ series, after }) => [series.address, after])).toEqual([
      [0, 0],
      [1, 0],
      [0, 10],
      [1, 10]
    ])
    expect(
      result.current['client-a|unit-1|holding_registers|0']?.map(({ value }) => value)
    ).toEqual([1, 2])
  })

  it('asks once, up to where the log stopped, while not live', async () => {
    answers[0] = [{ points: [], end: 3 }]
    const entries = [entry(0)]
    renderHook(() =>
      useLogWindows(entries, { live: false, span: TEN_MINUTES, until: NOW - 60_000, started: true })
    )
    await settle()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(asked.map(({ from, after }) => [from, after])).toEqual([[NOW - 60_000 - 600_000, 0]])
  })

  it('drops the samples that fell out of the window', async () => {
    answers[0] = [
      {
        points: [
          { time: NOW - 600_000 - 1, value: 1, error: undefined },
          { time: NOW - 1, value: 2, error: undefined }
        ],
        end: 2
      }
    ]
    const entries = [entry(0)]
    const { result } = renderHook(() =>
      useLogWindows(entries, { live: false, span: TEN_MINUTES, until: NOW, started: true })
    )
    await settle()

    expect(
      result.current['client-a|unit-1|holding_registers|0']?.map(({ value }) => value)
    ).toEqual([2])
  })
})

describe('windowStart', () => {
  it('starts a span before its end, and not before the oldest sample', () => {
    expect(windowStart(100, 30, 10)).toBe(70)
    expect(windowStart(100, 30, 80)).toBe(80)
  })

  it('starts a window with no bound at the oldest sample, and nowhere with none known', () => {
    expect(windowStart(100, Number.POSITIVE_INFINITY, 40)).toBe(40)
    expect(windowStart(100, Number.POSITIVE_INFINITY, undefined)).toBeUndefined()
  })

  it('starts a window of a span a span back, with no oldest sample known', () => {
    expect(windowStart(100, 30, undefined)).toBe(70)
  })
})

describe('the steps it asks in', () => {
  it('asks the whole log across what it holds, and not at all with no oldest sample known', async () => {
    const entries = [entry(0)]
    logHolds(NOW - 150_000)
    const { unmount } = renderHook(() =>
      useLogWindows(entries, {
        live: false,
        span: Number.POSITIVE_INFINITY,
        until: NOW,
        started: true
      })
    )
    await settle()
    unmount()

    logHolds(undefined)
    renderHook(() =>
      useLogWindows(entries, {
        live: false,
        span: Number.POSITIVE_INFINITY,
        until: NOW,
        started: false
      })
    )
    await settle()

    expect(asked.map(({ from, step }) => [from, step])).toEqual([[NOW - 150_000, 100]])
  })

  it('asks a live whole log once its oldest sample is known', async () => {
    answers[0] = [{ points: [], end: 0 }]
    logHolds(undefined)
    const entries = [entry(0)]
    renderHook(() =>
      useLogWindows(entries, {
        live: true,
        span: Number.POSITIVE_INFINITY,
        until: undefined,
        started: false
      })
    )
    await settle()
    logHolds(NOW - 150_000)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(asked.map(({ from }) => from)).toEqual([NOW - 150_000])
  })

  it('steps a range across its span, however little of it the log holds', async () => {
    answers[0] = [{ points: [], end: 0 }]
    logHolds(NOW - 5000)
    const entries = [entry(0)]
    renderHook(() =>
      useLogWindows(entries, { live: true, span: 3_600_000, until: undefined, started: true })
    )
    await settle()

    expect(asked.map(({ from, step }) => [from, step])).toEqual([[NOW - 5000, 2400]])
  })

  it('asks a live whole log again from its start once it wants twice its step', async () => {
    answers[0] = [
      { points: [{ time: NOW - 10, value: 1, error: undefined }], end: 1 },
      { points: [], end: 1 },
      { points: [{ time: NOW + 2000, value: 2, error: undefined }], end: 2 }
    ]
    logHolds(NOW - 1500)
    const entries = [entry(0)]
    const { result } = renderHook(() =>
      useLogWindows(entries, {
        live: true,
        span: Number.POSITIVE_INFINITY,
        until: undefined,
        started: true
      })
    )
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    // 1.5 s of log in 1,500 steps is 1 ms; 3.5 s later it wants 3.33 ms.
    expect(asked.map(({ step, after }) => [step, after])).toEqual([
      [1, 0],
      [1, 1],
      [3500 / 1500, 0]
    ])
    expect(result.current['client-a|unit-1|holding_registers|0']?.map(({ value }) => value)).toEqual([2])
  })

  it('keeps the step it first asked in as a live whole log grows', async () => {
    answers[0] = [
      { points: [], end: 0 },
      { points: [], end: 0 }
    ]
    logHolds(NOW - 150_000)
    const entries = [entry(0)]
    renderHook(() =>
      useLogWindows(entries, {
        live: true,
        span: Number.POSITIVE_INFINITY,
        until: undefined,
        started: true
      })
    )
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(asked.map(({ step }) => step)).toEqual([100, 100])
  })

  it('asks in the step it first asked in while live, and merges the stretch an answer goes on', async () => {
    // The stretch from NOW - 400 to NOW: the first answer ends in it with its
    // lowest, highest and newest, and the next goes on in it with a newer one.
    answers[0] = [
      {
        points: [
          { time: NOW - 1000, value: 1, error: undefined },
          { time: NOW - 390, value: 2, error: undefined },
          { time: NOW - 350, value: 5, error: undefined },
          { time: NOW - 340, value: 4, error: undefined }
        ],
        end: 4
      },
      { points: [{ time: NOW - 300, value: 4.5, error: undefined }], end: 5 }
    ]
    const entries = [entry(0)]
    const { result } = renderHook(() =>
      useLogWindows(entries, { live: true, span: TEN_MINUTES, until: undefined, started: true })
    )
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(asked.map(({ step }) => step)).toEqual([400, 400])
    // The stretch keeps one lowest, highest and newest: 4 at NOW - 340 is none of them now.
    expect(
      result.current['client-a|unit-1|holding_registers|0']?.map(({ time, value }) => [
        time - NOW,
        value
      ])
    ).toEqual([
      [-1000, 1],
      [-390, 2],
      [-350, 5],
      [-300, 4.5]
    ])
  })
})

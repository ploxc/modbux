// @vitest-environment happy-dom
//
// The trend asks main for each register's window, and while live asks again
// every second from the end of the last answer, one round after the other.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ClientLogWindow, LogWindow } from '@shared'
import { useLogWindows } from '../useLogWindows'
import type { DrawnEntry } from '../trendPanel.zustand'

const entry = (address: number): DrawnEntry => ({
  uuid: 'client-a',
  unit: 'unit-1',
  type: 'holding_registers',
  address,
  color: '#81bc57'
})
const NOW = 1_000_000_000

let asked: ClientLogWindow[] = []
let answers: Record<number, LogWindow[]> = {}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  asked = []
  answers = {}
  ;(window as unknown as { api: unknown }).api = {
    getLogWindow: (query: ClientLogWindow): Promise<LogWindow | undefined> => {
      asked.push(query)
      return Promise.resolve(answers[query.series.address]?.shift())
    }
  }
})

afterEach(() => vi.useRealTimers())

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
    const { result } = renderHook(() => useLogWindows(entries, true, undefined))
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
    renderHook(() => useLogWindows(entries, false, NOW - 60_000))
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
    const { result } = renderHook(() => useLogWindows(entries, false, NOW))
    await settle()

    expect(
      result.current['client-a|unit-1|holding_registers|0']?.map(({ value }) => value)
    ).toEqual([2])
  })
})

// @vitest-environment happy-dom
//
// Main sends one transaction per request. A register scan in chunks of one
// against a server that answers at once sent them faster than the renderer
// could write them, and a click on Stop waited 30 seconds for the window. They
// are collected and written on the timer the scan's rows use.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '@shared'
import { fireEvent, stubRenderer } from './stubRenderer'
import { MAIN_CLIENT_UUID } from '@shared'
import { shownData } from './shownData'
import { dataOf } from '../data.zustand.helpers'

const FLUSH_MS = 100

const transaction = (id: string): Transaction => ({
  id,
  timestamp: 0,
  unitId: 1,
  address: 0,
  code: 3,
  responseLength: 2,
  timeout: false,
  request: '0103000000010000',
  responses: []
})

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  localStorage.clear()
  stubRenderer()
})

afterEach(() => {
  vi.useRealTimers()
})

const loaded = async (): Promise<{
  ids: () => string[]
  writes: () => number
  clear: () => void
}> => {
  const { useDataZustand } = await import('../data.zustand')
  let writes = 0
  useDataZustand.subscribe((state, previous) => {
    if (
      dataOf(state, MAIN_CLIENT_UUID).transactions !==
      dataOf(previous, MAIN_CLIENT_UUID).transactions
    )
      writes++
  })
  return {
    ids: () => shownData(useDataZustand).transactions.map((entry) => entry.id),
    writes: () => writes,
    clear: () => useDataZustand.getState().clearTransactions(MAIN_CLIENT_UUID)
  }
}

describe('transactions main sends', () => {
  it('reach the log in one write per flush, newest first', async () => {
    const { ids, writes } = await loaded()

    fireEvent('transaction', { uuid: MAIN_CLIENT_UUID, transaction: transaction('a') })
    fireEvent('transaction', { uuid: MAIN_CLIENT_UUID, transaction: transaction('b') })
    fireEvent('transaction', { uuid: MAIN_CLIENT_UUID, transaction: transaction('c') })
    expect(ids()).toEqual([])

    vi.advanceTimersByTime(FLUSH_MS)

    expect(ids()).toEqual(['c', 'b', 'a'])
    expect(writes()).toBe(1)
  })

  it('do not outlive a clear', async () => {
    const { ids, clear } = await loaded()
    fireEvent('transaction', { uuid: MAIN_CLIENT_UUID, transaction: transaction('a') })

    clear()
    vi.advanceTimersByTime(FLUSH_MS)

    expect(ids()).toEqual([])
  })
})

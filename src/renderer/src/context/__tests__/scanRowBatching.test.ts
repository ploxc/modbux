// @vitest-environment happy-dom
//
// A scan sends one message per chunk and the grid draws the whole list again on
// each one, so the rows are collected and written on a timer. What that timer
// is holding has to go when the grid is replaced or a scan starts again.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, getDummyRegisterData, MAIN_CLIENT_UUID } from '@shared'
import { fireEvent, stubRenderer } from './stubRenderer'
import { patchShownData, shownData } from './shownData'

const SCAN_FLUSH_MS = 100

const rows = (addresses: number[]): unknown[] => addresses.map(getDummyRegisterData)

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  localStorage.clear()
  stubRenderer()
})

afterEach(() => {
  vi.useRealTimers()
})

/** The store, with the client told whether a scan is running. */
const loaded = async (
  scanningRegisters: boolean
): Promise<{
  addresses: () => number[]
  dropPendingScanRows: (uuid: string) => void
}> => {
  const { useDataZustand, dropPendingScanRows } = await import('../data.zustand')
  patchShownData(useDataZustand, { clientState: { ...defaultClientState, scanningRegisters } })

  return {
    addresses: () => shownData(useDataZustand).registerData.map((row) => row.id),
    dropPendingScanRows
  }
}

describe('rows a scan finds', () => {
  it('reach the grid in one write per flush', async () => {
    const { addresses } = await loaded(true)

    fireEvent('register_data', { uuid: MAIN_CLIENT_UUID, registerData: rows([0, 1]) })
    fireEvent('register_data', { uuid: MAIN_CLIENT_UUID, registerData: rows([2]) })
    expect(addresses()).toEqual([])

    vi.advanceTimersByTime(SCAN_FLUSH_MS)

    expect(addresses()).toEqual([0, 1, 2])
  })

  it('are dropped when the scan is asked to forget them', async () => {
    const { addresses, dropPendingScanRows } = await loaded(true)
    fireEvent('register_data', { uuid: MAIN_CLIENT_UUID, registerData: rows([0, 1]) })

    dropPendingScanRows(MAIN_CLIENT_UUID)
    vi.advanceTimersByTime(SCAN_FLUSH_MS)

    expect(addresses()).toEqual([])
  })
})

// Main sends the rows of the chunk in flight before the state that says the
// scan ended, and the button reads that state.
describe('rows a scan found when it ends', () => {
  it('reach the grid with the state that ends it', async () => {
    const { addresses } = await loaded(true)
    fireEvent('register_data', { uuid: MAIN_CLIENT_UUID, registerData: rows([0, 1]) })

    fireEvent('client_state', {
      uuid: MAIN_CLIENT_UUID,
      clientState: { ...defaultClientState, scanningRegisters: false }
    })

    expect(addresses()).toEqual([0, 1])
    vi.advanceTimersByTime(SCAN_FLUSH_MS)
    expect(addresses()).toEqual([0, 1])
  })

  it('wait for the flush while a state says the scan still runs', async () => {
    const { addresses } = await loaded(true)
    fireEvent('register_data', { uuid: MAIN_CLIENT_UUID, registerData: rows([0, 1]) })

    fireEvent('client_state', {
      uuid: MAIN_CLIENT_UUID,
      clientState: { ...defaultClientState, scanningRegisters: true }
    })

    expect(addresses()).toEqual([])
    vi.advanceTimersByTime(SCAN_FLUSH_MS)
    expect(addresses()).toEqual([0, 1])
  })
})

// A poll replaces the grid, so anything a scan left waiting answers a question
// nobody is asking any more.
describe('rows a poll reads', () => {
  it('replace the grid at once', async () => {
    const { addresses } = await loaded(false)

    fireEvent('register_data', { uuid: MAIN_CLIENT_UUID, registerData: rows([7]) })

    expect(addresses()).toEqual([7])
  })

  it('take what the scan had waiting with them', async () => {
    const { addresses } = await loaded(true)
    fireEvent('register_data', { uuid: MAIN_CLIENT_UUID, registerData: rows([0, 1]) })

    const { useDataZustand } = await import('../data.zustand')
    patchShownData(useDataZustand, {
      clientState: { ...defaultClientState, scanningRegisters: false }
    })
    fireEvent('register_data', { uuid: MAIN_CLIENT_UUID, registerData: rows([7]) })
    vi.advanceTimersByTime(SCAN_FLUSH_MS)

    expect(addresses()).toEqual([7])
  })
})

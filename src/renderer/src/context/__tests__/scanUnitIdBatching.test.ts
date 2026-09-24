// @vitest-environment happy-dom
//
// A unit id scan sends one result per unit id, and the table draws itself again
// on each one. With 255 ids the window lagged behind the scan, so the results
// are collected and written on a timer, the way the rows of a register scan are.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, type ScanUnitIDResult, MAIN_CLIENT_UUID } from '@shared'
import { fireEvent, stubRenderer } from './stubRenderer'
import { patchShownData, shownData } from './shownData'
import { dataOf } from '../data.zustand.helpers'

const SCAN_FLUSH_MS = 100

const result = (id: number): ScanUnitIDResult => ({
  id,
  registerTypes: ['holding_registers'],
  refusedRegisterTypes: [],
  requestedRegisterTypes: ['holding_registers'],
  errorMessage: { coils: '', discrete_inputs: '', input_registers: '', holding_registers: '' }
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
  ids: () => number[]
  writes: () => number
  clear: () => void
}> => {
  const { useDataZustand } = await import('../data.zustand')
  patchShownData(useDataZustand, { clientState: { ...defaultClientState, scanningUnitIds: true } })
  let writes = 0
  useDataZustand.subscribe((state, previous) => {
    if (
      dataOf(state, MAIN_CLIENT_UUID).scanUnitIdResults !==
      dataOf(previous, MAIN_CLIENT_UUID).scanUnitIdResults
    )
      writes++
  })
  return {
    ids: () => shownData(useDataZustand).scanUnitIdResults.map((entry) => entry.id),
    writes: () => writes,
    clear: () => useDataZustand.getState().clearScanUnitIdResults(MAIN_CLIENT_UUID)
  }
}

describe('results a unit id scan finds', () => {
  it('reach the table in one write per flush, newest first', async () => {
    const { ids, writes } = await loaded()

    fireEvent('scan_unit_id_result', { uuid: MAIN_CLIENT_UUID, result: result(1) })
    fireEvent('scan_unit_id_result', { uuid: MAIN_CLIENT_UUID, result: result(2) })
    fireEvent('scan_unit_id_result', { uuid: MAIN_CLIENT_UUID, result: result(3) })
    expect(ids()).toEqual([])

    vi.advanceTimersByTime(SCAN_FLUSH_MS)

    expect(ids()).toEqual([3, 2, 1])
    expect(writes()).toBe(1)
  })

  it('reach the table with the state that ends the scan', async () => {
    const { ids } = await loaded()
    fireEvent('scan_unit_id_result', { uuid: MAIN_CLIENT_UUID, result: result(1) })

    fireEvent('client_state', {
      uuid: MAIN_CLIENT_UUID,
      clientState: { ...defaultClientState, scanningUnitIds: false }
    })

    expect(ids()).toEqual([1])
  })

  it('do not outlive a clear', async () => {
    const { ids, clear } = await loaded()
    fireEvent('scan_unit_id_result', { uuid: MAIN_CLIENT_UUID, result: result(1) })

    clear()
    vi.advanceTimersByTime(SCAN_FLUSH_MS)

    expect(ids()).toEqual([])
  })
})

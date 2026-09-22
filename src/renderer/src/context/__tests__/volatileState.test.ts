// @vitest-environment happy-dom
//
// Five fields written at event rate live in `data.zustand`, which has no
// persist middleware. In `client.zustand` each of them serialized the whole
// partialized state, register mapping included, because zustand's persist
// wraps `setState` and calls `setItem` on every call with no debounce.
// `modbusClient.ts:990` sets `_totalScans` to the address count times the
// register type count, so a unit id scan of 1 through 247 over four types
// sends 988 `scan_progress` events alone.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_ZUSTAND_STORAGE_KEY, defaultClientState } from '@shared'
import type { ScanUnitIDResult, Transaction } from '@shared'
import { stubRenderer } from './stubRenderer'

const transaction: Transaction = {
  id: 'a',
  timestamp: 0,
  unitId: 1,
  address: 0,
  code: 3,
  responseLength: 2,
  timeout: false,
  request: '0103000000010000',
  responses: []
}

const scanResult: ScanUnitIDResult = {
  id: 1,
  registerTypes: ['holding_registers'],
  refusedRegisterTypes: [],
  requestedRegisterTypes: ['holding_registers'],
  errorMessage: { coils: '', discrete_inputs: '', input_registers: '', holding_registers: '' }
}

/** Every storage key written since the list was last emptied, in order. */
const keysWritten: string[] = []

const load = async (): Promise<{
  useClientZustand: typeof import('../client.zustand').useClientZustand
  useDataZustand: typeof import('../data.zustand').useDataZustand
}> => ({
  useClientZustand: (await import('../client.zustand')).useClientZustand,
  useDataZustand: (await import('../data.zustand')).useDataZustand
})

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  keysWritten.length = 0
  stubRenderer()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string) => {
    keysWritten.push(key)
  })
})

describe('what main pushes about the client', () => {
  it('reaches no storage, where a persisted field reaches it', async () => {
    const { useClientZustand, useDataZustand } = await load()
    const dataZustand = useDataZustand.getState()
    keysWritten.length = 0

    dataZustand.setClientState({ ...defaultClientState, connectState: 'connected' })
    dataZustand.addTransaction(transaction)
    dataZustand.addScanUnitIdResult(scanResult)
    dataZustand.setScanProgress(50)
    dataZustand.setLastSuccessfulTransactionMillis(1)

    expect(keysWritten).toEqual([])

    // The same spy under a field `partialize` keeps, so an empty list above is
    // the store staying off disk rather than the spy never being called.
    useClientZustand.getState().setName('a name')

    expect(keysWritten).toEqual([CLIENT_ZUSTAND_STORAGE_KEY])
  })

  it('lands in the store all the same', async () => {
    const { useDataZustand } = await load()
    const dataZustand = useDataZustand.getState()

    dataZustand.setClientState({ ...defaultClientState, connectState: 'connected' })
    dataZustand.addTransaction(transaction)
    dataZustand.addScanUnitIdResult(scanResult)
    dataZustand.setScanProgress(50)
    dataZustand.setLastSuccessfulTransactionMillis(1)

    const state = useDataZustand.getState()
    expect(state.clientState.connectState).toBe('connected')
    expect(state.transactions).toEqual([transaction])
    expect(state.scanUnitIdResults).toEqual([scanResult])
    expect(state.scanProgress).toBe(50)
    expect(state.lastSuccessfulTransactionMillis).toBe(1)
  })
})

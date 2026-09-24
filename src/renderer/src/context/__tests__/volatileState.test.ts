// @vitest-environment happy-dom
//
// Five fields written at event rate live in `live.zustand`, which has no
// persist middleware. In `client.zustand` each of them serialized the whole
// partialized state, register mapping included, because zustand's persist
// wraps `setState` and calls `setItem` on every call with no debounce. A unit
// id scan of 0 through 255 over four types logs 1024 transactions.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_ZUSTAND_STORAGE_KEY, defaultClientState, MAIN_CLIENT_UUID } from '@shared'
import type { ScanUnitIDResult, Transaction } from '@shared'
import { stubRenderer } from './stubRenderer'
import { shownData } from './shownData'

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
  useLiveZustand: typeof import('../live.zustand').useLiveZustand
}> => ({
  useClientZustand: (await import('../client.zustand')).useClientZustand,
  useLiveZustand: (await import('../live.zustand')).useLiveZustand
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
    const { useClientZustand, useLiveZustand } = await load()
    const liveZustand = useLiveZustand.getState()
    keysWritten.length = 0

    liveZustand.setClientState(MAIN_CLIENT_UUID, {
      ...defaultClientState,
      connectState: 'connected'
    })
    liveZustand.addTransactions(MAIN_CLIENT_UUID, [transaction])
    liveZustand.addScanUnitIdResults(MAIN_CLIENT_UUID, [scanResult])
    liveZustand.setScanProgress(MAIN_CLIENT_UUID, 50)
    liveZustand.setLastSuccessfulTransactionMillis(MAIN_CLIENT_UUID, 1)

    expect(keysWritten).toEqual([])

    // The same spy under a field `partialize` keeps, so an empty list above is
    // the store staying off disk rather than the spy never being called.
    useClientZustand.getState().setName('a name')

    expect(keysWritten).toEqual([CLIENT_ZUSTAND_STORAGE_KEY])
  })

  it('lands in the store all the same', async () => {
    const { useLiveZustand } = await load()
    const liveZustand = useLiveZustand.getState()

    liveZustand.setClientState(MAIN_CLIENT_UUID, {
      ...defaultClientState,
      connectState: 'connected'
    })
    liveZustand.addTransactions(MAIN_CLIENT_UUID, [transaction])
    liveZustand.addScanUnitIdResults(MAIN_CLIENT_UUID, [scanResult])
    liveZustand.setScanProgress(MAIN_CLIENT_UUID, 50)
    liveZustand.setLastSuccessfulTransactionMillis(MAIN_CLIENT_UUID, 1)

    const state = shownData(useLiveZustand)
    expect(state.clientState.connectState).toBe('connected')
    expect(state.transactions).toEqual([transaction])
    expect(state.scanUnitIdResults).toEqual([scanResult])
    expect(state.scanProgress).toBe(50)
    expect(state.lastSuccessfulTransactionMillis).toBe(1)
  })
})

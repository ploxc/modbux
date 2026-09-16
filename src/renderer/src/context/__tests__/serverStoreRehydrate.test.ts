// @vitest-environment happy-dom
//
// Both windows hold this store and both persist it to one key. Main addresses
// the two events that change it to the window showing the server, so while the
// split is up this copy hears nothing, and when that window closes the events
// come back to a copy that has not moved since load.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SERVER_ZUSTAND_VERSION, SERVER_ZUSTAND_STORAGE_KEY } from '@shared'
import { type ApiCall, fireEvent, recordApiCalls, stubRenderer } from './stubRenderer'

const register = (address: number): Record<string, unknown> => ({
  value: 1,
  params: {
    address,
    registerType: 'holding_registers',
    dataType: 'uint16',
    comment: '',
    value: 1
  }
})

const store = (addresses: number[]): string =>
  JSON.stringify({
    state: {
      selectedUuid: 'u',
      uuids: ['u'],
      port: { u: '502' },
      name: { u: 'bench' },
      unitId: { u: '0' },
      littleEndian: { u: false },
      usedAddresses: {},
      serverRegisters: {
        u: {
          '0': {
            coils: {},
            discrete_inputs: {},
            input_registers: {},
            holding_registers: Object.fromEntries(
              addresses.map((address) => [String(address), register(address)])
            )
          }
        }
      }
    },
    version: CURRENT_SERVER_ZUSTAND_VERSION
  })

const held = async (): Promise<string[]> => {
  const { useServerZustand } = await import('../server.zustand')
  return Object.keys(useServerZustand.getState().serverRegisters.u?.['0']?.holding_registers ?? {})
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('the server window closing', () => {
  it('re-reads what that window wrote while it was open', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0]))
    await import('../server.zustand')
    expect(await held()).toEqual(['0'])

    // What the split out window persisted, which this copy never heard about.
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0, 77]))

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })

    expect(await held()).toEqual(['0', '77'])
  })

  // `window_update` fires whenever either window handle moves, and the main
  // window gets one at launch with no server window in it. Re-reading there
  // would undo the repair the store has just done to a config it refused.
  it('does not re-read when no window was ever split', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0]))
    await import('../server.zustand')

    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0, 77]))
    fireEvent('window_update', { main: true, server: false })

    expect(await held()).toEqual(['0'])
  })

  // `rtuServerActive` is not persisted, so re-reading the key leaves it where
  // it was, and the split out window is the one that heard the last change.
  it('asks main for the RTU status, at load and at the close', async () => {
    const calls: ApiCall[] = []
    recordApiCalls(calls)
    await import('../server.zustand')

    const asked = (): number => calls.filter((c) => c.method === 'getRtuServerStatus').length
    expect(asked()).toBe(1)

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })

    expect(asked()).toBe(2)
  })
})

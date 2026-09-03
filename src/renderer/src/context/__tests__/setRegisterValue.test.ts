// @vitest-environment happy-dom
//
// Register values arrive batched on a 50 ms timer, so the event that proved the
// entry existed fired before the write lands. `removeRegister` and
// `resetRegisters` are both one click, which is what puts a flush on an address
// that is gone.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_SERVER_UUID } from '@shared'

const stubRenderer = (): void => {
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: {
      on: (): (() => void) => (): void => {},
      send: (): void => {},
      invoke: async (): Promise<undefined> => undefined
    }
  }
  w.api = new Proxy({}, { get: () => (): Promise<undefined> => Promise.resolve(undefined) })
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

/** The store with one holding register at address 10, on the default unit. */
const seeded = async (): Promise<typeof import('../server.zustand')> => {
  const store = await import('../server.zustand')
  store.useServerZustand.getState().clean(MAIN_SERVER_UUID)
  store.useServerZustand.setState((state) => {
    state.serverRegisters[MAIN_SERVER_UUID]!['0']!.holding_registers[10] = {
      value: 1,
      params: {
        address: 10,
        registerType: 'holding_registers',
        dataType: 'uint16',
        comment: '',
        value: 1,
        min: undefined,
        max: undefined,
        interval: undefined
      }
    }
  })
  return store
}

const registers = (store: typeof import('../server.zustand')): Record<string, { value: number }> =>
  store.useServerZustand.getState().serverRegisters[MAIN_SERVER_UUID]!['0']!.holding_registers

describe('setRegisterValue', () => {
  it('writes the value of an entry that is there', async () => {
    const store = await seeded()

    store.useServerZustand
      .getState()
      .setRegisterValue({ registerType: 'holding_registers', address: 10, value: 42 })

    expect(registers(store)[10]?.value).toBe(42)
  })

  it('drops a value for an address whose entry is gone', async () => {
    const store = await seeded()
    store.useServerZustand.setState((state) => {
      delete state.serverRegisters[MAIN_SERVER_UUID]!['0']!.holding_registers[10]
    })

    expect(() =>
      store.useServerZustand
        .getState()
        .setRegisterValue({ registerType: 'holding_registers', address: 10, value: 42 })
    ).not.toThrow()

    // Dropped, not recreated: the address the user deleted stays deleted.
    expect(Object.keys(registers(store))).toEqual([])
  })

  it('writes the entries beside one that is gone', async () => {
    const store = await seeded()
    store.useServerZustand.setState((state) => {
      state.serverRegisters[MAIN_SERVER_UUID]!['0']!.holding_registers[20] = {
        value: 2,
        params: {
          address: 20,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: '',
          value: 2,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      }
      delete state.serverRegisters[MAIN_SERVER_UUID]!['0']!.holding_registers[10]
    })

    store.useServerZustand.getState().setRegisterValue([
      { registerType: 'holding_registers', address: 10, value: 42 },
      { registerType: 'holding_registers', address: 20, value: 43 }
    ])

    expect(registers(store)[20]?.value).toBe(43)
  })
})

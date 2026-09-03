// @vitest-environment happy-dom
//
// Register values arrive batched on a 50 ms timer, so the event that proved the
// entry existed fired before the write lands. `removeRegister` and
// `resetRegisters` are both one click, which is what puts a flush on an address
// that is gone.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_SERVER_UUID, ServerRegister, ServerRegisters } from '@shared'

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

/**
 * The main server's default unit, or a failure saying it is not there.
 *
 * `clean` fills every unit id, so a miss here means the store was not seeded.
 */
const unit = (
  registers: Record<string, Record<string, ServerRegisters | undefined> | undefined>
): ServerRegisters => {
  const found = registers[MAIN_SERVER_UUID]?.['0']
  if (!found) throw new Error('the main server has no default unit')
  return found
}

/** One register entry, as the add dialog would have built it. */
const entry = (address: number, value: number): ServerRegister[string] => ({
  value,
  params: {
    address,
    registerType: 'holding_registers',
    dataType: 'uint16',
    comment: '',
    value,
    min: undefined,
    max: undefined,
    interval: undefined
  }
})

/** The store with one holding register at address 10, on the default unit. */
const seeded = async (): Promise<typeof import('../server.zustand')> => {
  const store = await import('../server.zustand')
  store.useServerZustand.getState().clean(MAIN_SERVER_UUID)
  store.useServerZustand.setState((state) => {
    unit(state.serverRegisters).holding_registers[10] = entry(10, 1)
  })
  return store
}

const registers = (store: typeof import('../server.zustand')): ServerRegister =>
  unit(store.useServerZustand.getState().serverRegisters).holding_registers

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
      delete unit(state.serverRegisters).holding_registers[10]
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
      unit(state.serverRegisters).holding_registers[20] = entry(20, 2)
      delete unit(state.serverRegisters).holding_registers[10]
    })

    store.useServerZustand.getState().setRegisterValue([
      { registerType: 'holding_registers', address: 10, value: 42 },
      { registerType: 'holding_registers', address: 20, value: 43 }
    ])

    expect(registers(store)[20]?.value).toBe(43)
  })
})

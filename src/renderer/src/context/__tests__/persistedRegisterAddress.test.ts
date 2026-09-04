// @vitest-environment happy-dom
//
// A register outside the 16 bit map could be persisted until the add path was
// measured against the remove path. This runs the store against such a blob,
// because the drop is only reached if `migrate` is wired to call it and the
// version constant has moved past the blob's own.
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('a server config stored with a register outside the map', () => {
  it('comes up without it and keeps every other register', async () => {
    localStorage.setItem(
      'server.zustand',
      JSON.stringify({
        state: {
          selectedUuid: 'u',
          uuids: ['u'],
          port: { u: '502' },
          name: { u: 'bench' },
          unitId: { u: '1' },
          littleEndian: { u: false },
          usedAddresses: {},
          serverRegisters: {
            u: {
              '1': {
                coils: { '3': { value: true }, '70000': { value: true } },
                discrete_inputs: {},
                input_registers: {},
                holding_registers: { '100': register(100), '70000': register(70000) }
              }
            }
          }
        },
        version: 4
      })
    )

    const { useServerZustand } = await import('../server.zustand')
    const registers = useServerZustand.getState().serverRegisters.u?.['1']

    expect(Object.keys(registers?.holding_registers ?? {})).toEqual(['100'])
    expect(Object.keys(registers?.coils ?? {})).toEqual(['3'])
    expect(useServerZustand.getState().name.u).toBe('bench')
    expect(useServerZustand.getState().configReset).toBeUndefined()
  })
})

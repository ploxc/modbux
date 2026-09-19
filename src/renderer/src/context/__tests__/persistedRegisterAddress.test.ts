// @vitest-environment happy-dom
//
// A register outside the 16 bit map could be persisted until the add path was
// measured against the remove path. This runs the store against such a blob,
// because the drop is only reached if `migrate` is wired to call it and the
// version constant has moved past the blob's own.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from './stubRenderer'

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
        version: 3
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

/** A generated register at `address` firing every millisecond. */
const generator = (address: number): Record<string, unknown> => ({
  value: 1,
  params: {
    address,
    registerType: 'holding_registers',
    dataType: 'uint16',
    comment: '',
    min: 0,
    max: 10,
    interval: 1
  }
})

// `usedAddresses` is the map `isAddressInUse` refuses an address against, so
// this is where the drop is either finished or half done.
describe('a server config stored with a generator the interval floor refuses', () => {
  it('leaves the address it stood on free', async () => {
    localStorage.setItem(
      'server.zustand',
      JSON.stringify({
        state: {
          selectedUuid: 'u',
          uuids: ['u'],
          port: { u: '502' },
          unitId: { u: '1' },
          littleEndian: { u: false },
          usedAddresses: { u: { '1': { input_registers: [], holding_registers: [200] } } },
          serverRegisters: {
            u: {
              '1': {
                coils: {},
                discrete_inputs: {},
                input_registers: {},
                holding_registers: { '200': generator(200) }
              }
            }
          }
        },
        version: 3
      })
    )

    const { useServerZustand } = await import('../server.zustand')

    expect(useServerZustand.getState().usedAddresses.u?.['1']?.holding_registers).toEqual([])
  })
})

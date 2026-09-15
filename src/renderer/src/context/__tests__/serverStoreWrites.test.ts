// @vitest-environment happy-dom
//
// `createServer` called `clean` from inside its own recipe, and a `set` that
// runs inside a running recipe is discarded, so a new server got a port and a
// uuid and no unit map at all. Fifteen lines spread over eight actions rebuilt
// what `clean` had failed to build, and that prologue read as care.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SERVER_ZUSTAND_VERSION,
  MAIN_SERVER_UUID,
  SERVER_ZUSTAND_STORAGE_KEY
} from '@shared'
import { stubRenderer } from './stubRenderer'

const NEW_UUID = 'a-second-server'

const stubCreateServer = (port: number): void => {
  const w = window as unknown as { api: Record<string, unknown> }
  const boundary = w.api
  w.api = new Proxy(boundary, {
    get: (target, method: string): unknown =>
      method === 'createServer'
        ? (): Promise<number> => Promise.resolve(port)
        : Reflect.get(target, method)
  })
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('a server that was just created', () => {
  it('has the unit map and the unit id clean gives it', async () => {
    stubCreateServer(5020)
    const { useServerZustand } = await import('../server.zustand')

    await useServerZustand.getState().createServer({ uuid: NEW_UUID, port: 5020 })

    const state = useServerZustand.getState()
    expect(state.serverRegisters[NEW_UUID]).toEqual({})
    expect(state.usedAddresses[NEW_UUID]).toEqual({})
    expect(state.unitId[NEW_UUID]).toBe('0')
    expect(state.port[NEW_UUID]).toBe('5020')
  })

  it('takes a register on the unit the dialog offers', async () => {
    stubCreateServer(5020)
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().createServer({ uuid: NEW_UUID, port: 5020 })

    await useServerZustand.getState().addRegister({
      uuid: NEW_UUID,
      unitId: '0',
      params: {
        address: 10,
        registerType: 'holding_registers',
        dataType: 'uint16',
        comment: '',
        value: 7,
        min: undefined,
        max: undefined,
        interval: undefined
      }
    })

    const state = useServerZustand.getState()
    expect(state.serverRegisters[NEW_UUID]?.['0']?.holding_registers[10]?.value).toBe(0)
    expect(state.usedAddresses[NEW_UUID]?.['0']?.['holding_registers']).toEqual([10])
  })
})

describe('what clean writes', () => {
  it('leaves the unit map empty rather than filling all 256', async () => {
    const { useServerZustand } = await import('../server.zustand')

    useServerZustand.getState().clean(MAIN_SERVER_UUID)

    expect(
      Object.keys(useServerZustand.getState().serverRegisters[MAIN_SERVER_UUID] ?? {})
    ).toEqual([])
  })
})

describe('a config written before the unit map was left empty', () => {
  it('loads, and takes a register on a unit it already carries', async () => {
    const registers = {
      coils: {},
      discrete_inputs: {},
      input_registers: {},
      holding_registers: {}
    }
    localStorage.setItem(
      SERVER_ZUSTAND_STORAGE_KEY,
      JSON.stringify({
        state: {
          selectedUuid: MAIN_SERVER_UUID,
          uuids: [MAIN_SERVER_UUID],
          serverRegisters: { [MAIN_SERVER_UUID]: { '0': registers, '1': registers } },
          usedAddresses: { [MAIN_SERVER_UUID]: { '0': {}, '1': {} } },
          port: { [MAIN_SERVER_UUID]: '502' },
          unitId: { [MAIN_SERVER_UUID]: '0' },
          name: {},
          littleEndian: { [MAIN_SERVER_UUID]: false }
        },
        version: CURRENT_SERVER_ZUSTAND_VERSION
      })
    )

    const { useServerZustand } = await import('../server.zustand')
    useServerZustand.getState().addBool('coils', 1)

    const state = useServerZustand.getState()
    expect(state.configReset).toBeUndefined()
    expect(Object.keys(state.serverRegisters[MAIN_SERVER_UUID] ?? {})).toEqual(['0', '1'])
    expect(state.serverRegisters[MAIN_SERVER_UUID]?.['0']?.coils[1]?.value).toBe(false)
  })
})

describe('resetServer', () => {
  it('asks main first and empties the store after', async () => {
    const { useServerZustand } = await import('../server.zustand')
    // What the store still held when main was asked. `clean` running first
    // would make this an empty list, and main would be resetting a uuid the
    // renderer has already forgotten.
    const unitsAtAskTime: string[][] = []
    const w = window as unknown as { api: Record<string, unknown> }
    const boundary = w.api
    w.api = new Proxy(boundary, {
      get: (target, method: string): unknown =>
        method === 'resetServer'
          ? (uuid: string): Promise<void> => {
              const units = useServerZustand.getState().serverRegisters[uuid] ?? {}
              unitsAtAskTime.push(Object.keys(units))
              return Promise.resolve()
            }
          : Reflect.get(target, method)
    })
    useServerZustand.getState().clean(MAIN_SERVER_UUID)
    useServerZustand.getState().addBool('coils', 3)

    await useServerZustand.getState().resetServer(MAIN_SERVER_UUID)

    expect(unitsAtAskTime).toEqual([['0']])
    expect(useServerZustand.getState().serverRegisters[MAIN_SERVER_UUID]).toEqual({})
    expect(useServerZustand.getState().usedAddresses[MAIN_SERVER_UUID]).toEqual({})
  })
})

describe('getUnitId', () => {
  it('answers 0 for a uuid it has never seen and writes nothing', async () => {
    const { useServerZustand } = await import('../server.zustand')

    const unitId = useServerZustand.getState().getUnitId(NEW_UUID)

    expect(unitId).toBe('0')
    expect(Object.keys(useServerZustand.getState().unitId)).toEqual([MAIN_SERVER_UUID])
  })
})

describe('a bool the store writes', () => {
  it('reaches the backend with what was written', async () => {
    const { useServerZustand } = await import('../server.zustand')
    const setBool = vi.fn()
    const w = window as unknown as { api: Record<string, unknown> }
    const boundary = w.api
    w.api = new Proxy(boundary, {
      get: (target, method: string): unknown =>
        method === 'setBool' ? setBool : Reflect.get(target, method)
    })
    useServerZustand.getState().clean(MAIN_SERVER_UUID)

    useServerZustand.getState().addBool('coils', 3)

    expect(
      useServerZustand.getState().serverRegisters[MAIN_SERVER_UUID]?.['0']?.coils[3]?.value
    ).toBe(false)
    expect(setBool).toHaveBeenCalledWith({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      registerType: 'coils',
      address: 3,
      state: false
    })
  })

  it('keeps the value an address already carries', async () => {
    const { useServerZustand } = await import('../server.zustand')
    useServerZustand.getState().clean(MAIN_SERVER_UUID)
    useServerZustand.getState().addBool('coils', 3)
    useServerZustand.getState().setBool({ registerType: 'coils', address: 3, boolState: true })

    useServerZustand.getState().addBool('coils', 3)

    expect(
      useServerZustand.getState().serverRegisters[MAIN_SERVER_UUID]?.['0']?.coils[3]?.value
    ).toBe(true)
  })

  it('builds no unit when a bool is removed from one that holds nothing', async () => {
    const { useServerZustand } = await import('../server.zustand')
    useServerZustand.getState().clean(MAIN_SERVER_UUID)

    useServerZustand.getState().removeBool('coils', 3)

    expect(useServerZustand.getState().serverRegisters[MAIN_SERVER_UUID]).toEqual({})
  })
})

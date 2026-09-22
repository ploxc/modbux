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

    const server = useServerZustand.getState().servers[NEW_UUID]
    expect(server?.registers).toEqual({})
    expect(server?.usedAddresses).toEqual({})
    expect(server?.unitId).toBe('0')
    expect(server?.port).toBe('5020')
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

    const server = useServerZustand.getState().servers[NEW_UUID]
    expect(server?.registers['0']?.holding_registers[10]?.value).toBe(0)
    expect(server?.usedAddresses['0']?.['holding_registers']).toEqual([10])
  })

  // Main encodes the register and sends its `register_value` words before it
  // answers this call, so they reach a store with no entry yet and are dropped.
  // They come back with the answer instead, and go through the same merge and
  // the same 50 ms batcher the event feeds.
  it('holds what main answered with, decoded', async () => {
    stubCreateServer(5020)
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().createServer({ uuid: NEW_UUID, port: 5020 })

    const boundary = window.api as unknown as Record<string, unknown>
    window.api = new Proxy(boundary, {
      get: (target, method: string): unknown =>
        method === 'addReplaceServerRegister'
          ? (): Promise<number[]> => Promise.resolve([0xffff])
          : Reflect.get(target, method)
    }) as never

    await useServerZustand.getState().addRegister({
      uuid: NEW_UUID,
      unitId: '0',
      params: {
        address: 10,
        registerType: 'holding_registers',
        dataType: 'int16',
        comment: '',
        value: -1,
        min: undefined,
        max: undefined,
        interval: undefined
      }
    })

    await vi.waitFor(() =>
      expect(
        useServerZustand.getState().servers[NEW_UUID]?.registers['0']?.holding_registers[10]?.value
      ).toBe(-1)
    )
  })

  // A grid drawing a register the server does not serve is what this avoids.
  // `RegisterAddressSchema` refuses 70000, so `add_replace_server_register`
  // answers undefined and the store has nothing to show.
  it('keeps no register main refused', async () => {
    stubCreateServer(5020)
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().createServer({ uuid: NEW_UUID, port: 5020 })

    await useServerZustand.getState().addRegister({
      uuid: NEW_UUID,
      unitId: '0',
      params: {
        address: 70000,
        registerType: 'holding_registers',
        dataType: 'uint16',
        comment: '',
        value: 7,
        min: undefined,
        max: undefined,
        interval: undefined
      }
    })

    expect(useServerZustand.getState().servers[NEW_UUID]?.registers).toEqual({})
  })
})

describe('what clean writes', () => {
  it('leaves the unit map empty rather than filling all 256', async () => {
    const { useServerZustand } = await import('../server.zustand')

    useServerZustand.getState().clean(MAIN_SERVER_UUID)

    expect(
      Object.keys(useServerZustand.getState().servers[MAIN_SERVER_UUID]?.registers ?? {})
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
          servers: {
            [MAIN_SERVER_UUID]: {
              port: '502',
              unitId: '0',
              littleEndian: false,
              registers: { '0': registers, '1': registers },
              usedAddresses: { '0': {}, '1': {} }
            }
          }
        },
        version: CURRENT_SERVER_ZUSTAND_VERSION
      })
    )

    const { useServerZustand } = await import('../server.zustand')
    useServerZustand.getState().addBool('coils', 1)

    const state = useServerZustand.getState()
    expect(state.configReset).toBeUndefined()
    expect(Object.keys(state.servers[MAIN_SERVER_UUID]?.registers ?? {})).toEqual(['0', '1'])
    expect(state.servers[MAIN_SERVER_UUID]?.registers['0']?.coils[1]?.value).toBe(false)
  })
})

describe('deleteServer', () => {
  it('leaves nothing keyed by the uuid behind, the name included', async () => {
    stubCreateServer(5020)
    const { useServerZustand } = await import('../server.zustand')

    await useServerZustand.getState().createServer({ uuid: NEW_UUID, port: 5020 })
    useServerZustand.getState().setName('the one being deleted')

    await useServerZustand.getState().deleteServer(NEW_UUID)

    const state = useServerZustand.getState()
    expect(NEW_UUID in state.servers).toBe(false)
    expect(NEW_UUID in state.ready).toBe(false)
  })

  // The name went into a record of its own and outlived the delete, and the
  // sweep that was supposed to take it read a record the delete had already
  // emptied. A name is a field of a server now, so a uuid naming none takes
  // nothing.
  it('writes no name for a uuid that names no server', async () => {
    const { useServerZustand } = await import('../server.zustand')

    useServerZustand.getState().setSelectedUuid(NEW_UUID)
    useServerZustand.getState().setName('never bound')

    expect(NEW_UUID in useServerZustand.getState().servers).toBe(false)
  })
})

describe('resetServer', () => {
  it('asks main and empties the store', async () => {
    const { useServerZustand } = await import('../server.zustand')
    const resetServer = vi.fn()
    const w = window as unknown as { api: Record<string, unknown> }
    const boundary = w.api
    w.api = new Proxy(boundary, {
      get: (target, method: string): unknown =>
        method === 'resetServer' ? resetServer : Reflect.get(target, method)
    })
    useServerZustand.getState().clean(MAIN_SERVER_UUID)
    useServerZustand.getState().addBool('coils', 3)

    await useServerZustand.getState().resetServer(MAIN_SERVER_UUID)

    expect(resetServer).toHaveBeenCalledWith(MAIN_SERVER_UUID)
    const server = useServerZustand.getState().servers[MAIN_SERVER_UUID]
    expect(server?.registers).toEqual({})
    expect(server?.usedAddresses).toEqual({})
  })
})

describe('getUnitId', () => {
  it('answers 0 for a uuid it has never seen and writes nothing', async () => {
    const { useServerZustand } = await import('../server.zustand')

    const unitId = useServerZustand.getState().getUnitId(NEW_UUID)

    expect(unitId).toBe('0')
    expect(Object.keys(useServerZustand.getState().servers)).toEqual([MAIN_SERVER_UUID])
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
      useServerZustand.getState().servers[MAIN_SERVER_UUID]?.registers['0']?.coils[3]?.value
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
      useServerZustand.getState().servers[MAIN_SERVER_UUID]?.registers['0']?.coils[3]?.value
    ).toBe(true)
  })

  // Main sends `register_value` from inside the call the store is waiting on,
  // and the batcher hands over 50 ms later, so a flush can land for a server
  // `deleteServer` took out in between. Dropped rather than written, which is
  // what `setRegisterValue` does with an address that is gone.
  it('is dropped for a uuid that names no server', async () => {
    stubCreateServer(5020)
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().createServer({ uuid: NEW_UUID, port: 5020 })
    await useServerZustand.getState().deleteServer(NEW_UUID)

    useServerZustand.getState().setBool({
      registerType: 'coils',
      address: 3,
      boolState: true,
      optionalUuid: NEW_UUID,
      optionalUnitId: '0'
    })

    expect(NEW_UUID in useServerZustand.getState().servers).toBe(false)
  })

  it('builds no unit when a bool is removed from one that holds nothing', async () => {
    const { useServerZustand } = await import('../server.zustand')
    useServerZustand.getState().clean(MAIN_SERVER_UUID)

    useServerZustand.getState().removeBool('coils', 3)

    expect(useServerZustand.getState().servers[MAIN_SERVER_UUID]?.registers).toEqual({})
  })
})

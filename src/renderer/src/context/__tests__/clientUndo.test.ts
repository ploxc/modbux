// @vitest-environment happy-dom
//
// An undo replays the setter a user's edit went through, so what it puts back
// reaches main the same way and passes the same guards. These drive the client
// store through the renderer stub and read what the store holds after.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, MAIN_CLIENT_UUID } from '@shared'
import { stubRenderer } from './stubRenderer'
import { patchSelectedClient } from './selectedClient'
import { selectedClient } from '../client.zustand.helpers'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

/** Main answers `undefined` on one channel from here on, as it does for a payload it refuses. */
const refuse = (method: string): void => {
  const underneath = window.api as unknown as Record<string, unknown>
  window.api = new Proxy(
    {},
    {
      get: (_target, name: string): unknown =>
        name === method ? (): Promise<undefined> => Promise.resolve(undefined) : underneath[name]
    }
  ) as never
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

const load = async (): Promise<{
  client: () => ReturnType<typeof import('../client.zustand').useClientZustand.getState>
  undo: () => ReturnType<typeof import('../undo.zustand').useUndoZustand.getState>
  clientUndo: typeof import('../clientUndo')
  setConnected: (connected: boolean) => void
}> => {
  const { useClientZustand } = await import('../client.zustand')
  const { useUndoZustand } = await import('../undo.zustand')
  const { useDataZustand } = await import('../data.zustand')
  const clientUndo = await import('../clientUndo')
  return {
    client: () => useClientZustand.getState(),
    undo: () => useUndoZustand.getState(),
    clientUndo,
    setConnected: (connected) =>
      useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, {
        ...defaultClientState,
        connectState: connected ? 'connected' : 'disconnected'
      })
  }
}

describe('a field', () => {
  it('undoes a typed run in one step and redoes it', async () => {
    const { client, clientUndo } = await load()
    const before = selectedClient(client()).connectionConfig.tcp.host

    for (const typed of ['1', '10', '10.0.0.5']) await client().setHost(typed, true)

    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedClient(client()).connectionConfig.tcp.host).toBe(before)

    expect(await clientUndo.redoClient()).toBe('done')
    expect(selectedClient(client()).connectionConfig.tcp.host).toBe('10.0.0.5')
  })

  it('starts the run from the host there was before the field was cleared', async () => {
    const { client, undo, clientUndo } = await load()
    const before = selectedClient(client()).connectionConfig.tcp.host

    await client().setHost('', false)
    await client().setHost('1', true)
    await client().setHost('10', true)
    expect(undo().client.past).toHaveLength(1)
    await clientUndo.undoClient()

    expect(selectedClient(client()).connectionConfig.tcp.host).toBe(before)
  })

  it('records nothing for a value the store held already', async () => {
    const { client, undo } = await load()
    await client().setUnitId('7')
    const steps = undo().client.past.length

    await client().setUnitId('7')

    expect(undo().client.past).toHaveLength(steps)
  })

  it('records nothing for a write that leaves the value where it was', async () => {
    const { client, undo } = await load()

    await client().setPollRate(selectedClient(client()).registerConfig.pollRate)

    expect(undo().client.past).toEqual([])
  })

  it('records nothing for a write main refused', async () => {
    const { client, undo } = await load()

    await client().setUnitId('1,5')

    expect(undo().client.past).toEqual([])
  })

  it('records nothing until the last of two quiet stretches has ended', async () => {
    const { client, undo } = await load()
    undo().beginQuiet()
    undo().beginQuiet()
    undo().endQuiet()

    await client().setPollRate(5000)

    expect(undo().client.past).toEqual([])
  })

  it('records nothing while it replays', async () => {
    const { client, undo, clientUndo } = await load()
    await client().setPollRate(5000)
    await client().setTimeout(3000)

    await clientUndo.undoClient()

    expect(undo().client.past).toHaveLength(1)
    expect(undo().client.future).toHaveLength(1)
  })

  it('refuses a connection field while a connection stands, and keeps the step', async () => {
    const { client, undo, clientUndo, setConnected } = await load()
    const before = selectedClient(client()).connectionConfig.tcp.host
    await client().setHost('10.0.0.5', true)
    setConnected(true)

    expect(await clientUndo.undoClient()).toBe('refused-connected')
    expect(selectedClient(client()).connectionConfig.tcp.host).toBe('10.0.0.5')
    expect(undo().client.past).toHaveLength(1)

    setConnected(false)
    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedClient(client()).connectionConfig.tcp.host).toBe(before)
  })

  it('puts back an invalid value it kept, and reaches the step behind it', async () => {
    const { client, clientUndo } = await load()
    await client().setType('coils')
    await client().setLength('0', false)
    await client().setType('holding_registers')
    await client().setLength('5', true)

    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedClient(client()).registerConfig.length).toBe(0)
    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedClient(client()).registerConfig.type).toBe('coils')
  })

  it('puts back a parity a config from before it existed never carried', async () => {
    const { client, clientUndo } = await load()
    const { useClientZustand } = await import('../client.zustand')
    const { baudRate, dataBits, stopBits } = selectedClient(client()).connectionConfig.rtu.options
    patchSelectedClient(useClientZustand, {
      connectionConfig: {
        ...selectedClient(client()).connectionConfig,
        rtu: {
          ...selectedClient(client()).connectionConfig.rtu,
          options: { baudRate, dataBits, stopBits }
        }
      }
    })
    await client().setParity('even')

    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedClient(client()).connectionConfig.rtu.options.parity).toBe('none')
  })

  it('ends the open run on a write made while quiet', async () => {
    const { client, undo, clientUndo } = await load()
    await client().setPollRate(5000)
    undo().beginQuiet()
    await client().setPollRate(6000)
    undo().endQuiet()

    await client().setPollRate(7000)
    await clientUndo.undoClient()

    expect(selectedClient(client()).registerConfig.pollRate).toBe(6000)
  })

  it('puts back a field that is no connection setting while a connection stands', async () => {
    const { client, clientUndo, setConnected } = await load()
    await client().setUnitId('7')
    setConnected(true)

    expect(await clientUndo.undoClient()).toBe('done')
  })

  it('leaves nothing to redo once a new edit comes after an undo', async () => {
    const { client, clientUndo } = await load()
    await client().setPollRate(5000)
    await clientUndo.undoClient()

    await client().setTimeout(3000)

    expect(await clientUndo.redoClient()).toBe('empty')
  })

  it('answers empty when there is nothing to undo', async () => {
    const { clientUndo } = await load()

    expect(await clientUndo.undoClient()).toBe('empty')
    expect(await clientUndo.redoClient()).toBe('empty')
  })
})

describe('a mapping entry', () => {
  it('goes back under the type it was edited in, and shows that type', async () => {
    const { client, undo, clientUndo } = await load()
    await client().setType('holding_registers')
    client().setRegisterMapping(3, 'comment', 'pump')
    // Another type on screen, with no step of its own in between.
    undo().beginQuiet()
    await client().setType('coils')
    undo().endQuiet()

    await clientUndo.undoClient()

    expect(selectedClient(client()).registerConfig.type).toBe('holding_registers')
    expect(selectedClient(client()).registerMapping.holding_registers[3]).toBeUndefined()

    await clientUndo.redoClient()
    expect(selectedClient(client()).registerMapping.holding_registers[3]).toEqual({
      comment: 'pump'
    })
  })

  it('comes back whole after a data type of none removed it', async () => {
    const { client, clientUndo } = await load()
    await client().setType('holding_registers')
    client().setRegisterMapping(3, 'dataType', 'int16')
    client().setRegisterMapping(3, 'comment', 'pump')

    client().setRegisterMapping(3, 'dataType', 'none')
    expect(selectedClient(client()).registerMapping.holding_registers[3]).toBeUndefined()

    await clientUndo.undoClient()
    expect(selectedClient(client()).registerMapping.holding_registers[3]).toEqual({
      dataType: 'int16',
      comment: 'pump'
    })
  })
})

describe('Load and Clear Config', () => {
  it('are one step that puts the name, the byte order and the mapping back', async () => {
    const { client, undo, clientUndo } = await load()
    await client().setType('holding_registers')
    client().setName('boiler')
    client().setRegisterMapping(3, 'comment', 'pump')
    await client().setLittleEndian(true)
    const steps = undo().client.past.length

    await clientUndo.asOneClientStep(async () => {
      client().setName('')
      await client().setLittleEndian(false)
      await client().clearRegisterMapping()
    })
    expect(undo().client.past).toHaveLength(steps + 1)

    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedClient(client()).name).toBe('boiler')
    expect(selectedClient(client()).registerConfig.littleEndian).toBe(true)
    expect(selectedClient(client()).registerMapping.holding_registers[3]).toEqual({
      comment: 'pump'
    })
  })

  it('leaves the byte order where it was when main refuses the mapping', async () => {
    const { client, clientUndo } = await load()
    await client().setType('holding_registers')
    client().setRegisterMapping(3, 'comment', 'pump')
    await client().setLittleEndian(true)
    await clientUndo.asOneClientStep(async () => {
      await client().setLittleEndian(false)
      await client().clearRegisterMapping()
    })
    refuse('setRegisterMapping')

    expect(await clientUndo.undoClient()).toBe('refused')
    expect(selectedClient(client()).registerConfig.littleEndian).toBe(false)
    expect(selectedClient(client()).registerMapping.holding_registers[3]).toBeUndefined()
  })

  it('leaves the mapping where it was when main refuses the byte order', async () => {
    const { client, clientUndo } = await load()
    await client().setType('holding_registers')
    client().setRegisterMapping(3, 'comment', 'pump')
    await client().setLittleEndian(true)
    await clientUndo.asOneClientStep(async () => {
      await client().setLittleEndian(false)
      await client().clearRegisterMapping()
    })
    refuse('updateRegisterConfig')

    expect(await clientUndo.undoClient()).toBe('refused')
    expect(selectedClient(client()).registerMapping.holding_registers[3]).toBeUndefined()
  })

  it('records its step while an undo that started first is still quiet', async () => {
    const { client, undo, clientUndo } = await load()
    client().setName('boiler')
    undo().beginQuiet()

    await clientUndo.asOneClientStep(async () => {
      client().setName('')
    })
    undo().endQuiet()

    expect(undo().client.past.at(-1)).toEqual({
      kind: 'configuration',
      uuid: MAIN_CLIENT_UUID,
      value: expect.objectContaining({ name: 'boiler' })
    })
  })

  it('records the step of an action that threw after it changed something', async () => {
    const { client, undo, clientUndo } = await load()
    client().setName('boiler')

    await expect(
      clientUndo.asOneClientStep(async () => {
        client().setName('')
        throw new Error('the file went away')
      })
    ).rejects.toThrow('the file went away')

    expect(undo().client.past.at(-1)).toEqual({
      kind: 'configuration',
      uuid: MAIN_CLIENT_UUID,
      value: expect.objectContaining({ name: 'boiler' })
    })
  })

  it('records nothing for a Clear Config with nothing to clear', async () => {
    const { client, undo, clientUndo } = await load()

    await clientUndo.asOneClientStep(async () => {
      client().setName('')
      await client().clearRegisterMapping()
    })

    expect(undo().client.past).toEqual([])
  })

  it('records nothing when the action changed nothing', async () => {
    const { undo, clientUndo } = await load()

    await clientUndo.asOneClientStep(async () => {})

    expect(undo().client.past).toEqual([])
  })
})

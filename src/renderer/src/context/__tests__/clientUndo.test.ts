// @vitest-environment happy-dom
//
// An undo replays the setter a user's edit went through, so what it puts back
// reaches main the same way and passes the same guards. These drive the client
// store through the renderer stub and read what the store holds after.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, MAIN_CLIENT_UUID } from '@shared'
import { stubRenderer } from './stubRenderer'
import { patchSelectedClient } from './selectedClient'
import {
  MAIN_UNIT_UUID,
  selectedClient,
  selectedUnit,
  shownSection,
  shownType
} from '../client.zustand.helpers'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

/**
 * Main answers `undefined` to the `refused`th call of one channel from here on,
 * counting from 1, as it does for a payload it refuses, and answers the rest.
 */
const refuseCall = (method: string, refused: number): void => {
  const underneath = window.api as unknown as Record<string, unknown>
  let calls = 0
  window.api = new Proxy(
    {},
    {
      get: (_target, name: string): unknown => {
        const answer = underneath[name]
        if (name !== method || typeof answer !== 'function') return answer
        return (payload: unknown): unknown => {
          calls++
          if (calls === refused) return Promise.resolve(undefined)
          return (answer as (payload: unknown) => unknown)(payload)
        }
      }
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
  const { useLiveZustand } = await import('../live.zustand')
  const clientUndo = await import('../clientUndo')
  return {
    client: () => useClientZustand.getState(),
    undo: () => useUndoZustand.getState(),
    clientUndo,
    setConnected: (connected) =>
      useLiveZustand.getState().setClientState(MAIN_CLIENT_UUID, {
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

  it('puts a length back in the section it was typed in, and shows that section', async () => {
    const { client, clientUndo } = await load()
    const before = shownSection(client()).length
    client().showType('coils')
    await client().setLength('0')
    client().showType('holding_registers')
    await client().setLength('5')

    expect(await clientUndo.undoClient()).toBe('done')
    expect(shownType(client())).toBe('holding_registers')
    expect(shownSection(client()).length).toBe(before)
    expect(selectedUnit(client()).sections.coils.length).toBe(0)
    expect(await clientUndo.undoClient()).toBe('done')
    expect(shownType(client())).toBe('coils')
    expect(shownSection(client()).length).toBe(before)
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
    client().showType('holding_registers')
    client().setRegisterMapping('holding_registers', 3, 'comment', 'pump')
    // Another type on screen, with no step of its own in between.
    undo().beginQuiet()
    client().showType('coils')
    undo().endQuiet()

    await clientUndo.undoClient()

    expect(shownType(client())).toBe('holding_registers')
    expect(selectedUnit(client()).registerMapping.holding_registers[3]).toBeUndefined()

    await clientUndo.redoClient()
    expect(selectedUnit(client()).registerMapping.holding_registers[3]).toEqual({
      comment: 'pump'
    })
  })

  it('comes back whole after a data type of none removed it', async () => {
    const { client, clientUndo } = await load()
    client().showType('holding_registers')
    client().setRegisterMapping('holding_registers', 3, 'dataType', 'int16')
    client().setRegisterMapping('holding_registers', 3, 'comment', 'pump')

    client().setRegisterMapping('holding_registers', 3, 'dataType', 'none')
    expect(selectedUnit(client()).registerMapping.holding_registers[3]).toBeUndefined()

    await clientUndo.undoClient()
    expect(selectedUnit(client()).registerMapping.holding_registers[3]).toEqual({
      dataType: 'int16',
      comment: 'pump'
    })
  })
})

describe("a unit's name and layout", () => {
  it('takes a name typed a key at a time back as one step', async () => {
    const { client, clientUndo } = await load()
    client().setUnitName('b')
    client().setUnitName('bo')
    client().setUnitName('boiler')

    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedUnit(client()).name).toBe('')
    expect(await clientUndo.redoClient()).toBe('done')
    expect(selectedUnit(client()).name).toBe('boiler')
  })

  // A drag, a dock and a splitter each call setLayout once, when they end.
  it('takes each layout change back as a step of its own', async () => {
    const { client, clientUndo } = await load()
    client().setLayout('r(hr:50,co:50)')
    client().setLayout('r(hr:70,co:30)')

    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedUnit(client()).layout).toBe('r(hr:50,co:50)')
    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedUnit(client()).layout).toBe('hr')
  })
})

describe('a register type turned on or off', () => {
  it('is a layout step, taken back to the layout before', async () => {
    const { client, clientUndo } = await load()
    client().setType('coils')
    expect(selectedUnit(client()).layout).not.toBe('hr')

    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedUnit(client()).layout).toBe('hr')
  })

  // The undo opens the type the step is about, and that opening is no step.
  it('opens a closed type for an undo without a step of its own', async () => {
    const { client, undo, clientUndo } = await load()
    client().setType('coils')
    client().setRegisterMapping('coils', 3, 'comment', 'pump')
    undo().beginQuiet()
    client().setType('coils')
    undo().endQuiet()
    const steps = undo().client.past.length

    expect(await clientUndo.undoClient()).toBe('done')
    expect(undo().client.past).toHaveLength(steps - 1)
    expect(undo().client.future).toHaveLength(1)
  })
})

describe('Load and Clear Config', () => {
  it('are one step that puts the name, the byte order, the mapping and the layout back', async () => {
    const { client, undo, clientUndo } = await load()
    client().showType('holding_registers')
    client().setUnitName('boiler')
    client().setRegisterMapping('holding_registers', 3, 'comment', 'pump')
    await client().setLittleEndian(true)
    const steps = undo().client.past.length

    await clientUndo.asOneClientStep(async () => {
      client().setUnitName('')
      await client().setLittleEndian(false)
      await client().clearRegisterMapping()
      // Load hands over a file's layout too.
      client().setLayout('r(hr:50,co:50)')
    })
    expect(undo().client.past).toHaveLength(steps + 1)

    expect(await clientUndo.undoClient()).toBe('done')
    expect(selectedUnit(client()).name).toBe('boiler')
    expect(selectedUnit(client()).littleEndian).toBe(true)
    expect(selectedUnit(client()).layout).toBe('hr')
    expect(selectedUnit(client()).registerMapping.holding_registers[3]).toEqual({
      comment: 'pump'
    })
  })

  it('leaves the byte order where it was when main refuses the mapping', async () => {
    const { client, clientUndo } = await load()
    client().showType('holding_registers')
    client().setRegisterMapping('holding_registers', 3, 'comment', 'pump')
    await client().setLittleEndian(true)
    await clientUndo.asOneClientStep(async () => {
      await client().setLittleEndian(false)
      await client().clearRegisterMapping()
    })
    // The byte order goes out first and is taken, then the mapping is refused.
    refuseCall('setUnits', 2)

    expect(await clientUndo.undoClient()).toBe('refused')
    expect(selectedUnit(client()).littleEndian).toBe(false)
    expect(selectedUnit(client()).registerMapping.holding_registers[3]).toBeUndefined()
  })

  it('leaves the mapping where it was when main refuses the byte order', async () => {
    const { client, clientUndo } = await load()
    client().showType('holding_registers')
    client().setRegisterMapping('holding_registers', 3, 'comment', 'pump')
    await client().setLittleEndian(true)
    await clientUndo.asOneClientStep(async () => {
      await client().setLittleEndian(false)
      await client().clearRegisterMapping()
    })
    refuseCall('setUnits', 1)

    expect(await clientUndo.undoClient()).toBe('refused')
    expect(selectedUnit(client()).registerMapping.holding_registers[3]).toBeUndefined()
  })

  it('records its step while an undo that started first is still quiet', async () => {
    const { client, undo, clientUndo } = await load()
    client().setUnitName('boiler')
    undo().beginQuiet()

    await clientUndo.asOneClientStep(async () => {
      client().setUnitName('')
    })
    undo().endQuiet()

    expect(undo().client.past.at(-1)).toEqual({
      kind: 'configuration',
      uuid: MAIN_CLIENT_UUID,
      unit: MAIN_UNIT_UUID,
      type: 'holding_registers',
      value: expect.objectContaining({ name: 'boiler' })
    })
  })

  it('records the step of an action that threw after it changed something', async () => {
    const { client, undo, clientUndo } = await load()
    client().setUnitName('boiler')

    await expect(
      clientUndo.asOneClientStep(async () => {
        client().setUnitName('')
        throw new Error('the file went away')
      })
    ).rejects.toThrow('the file went away')

    expect(undo().client.past.at(-1)).toEqual({
      kind: 'configuration',
      uuid: MAIN_CLIENT_UUID,
      unit: MAIN_UNIT_UUID,
      type: 'holding_registers',
      value: expect.objectContaining({ name: 'boiler' })
    })
  })

  it('records nothing for a Clear Config with nothing to clear', async () => {
    const { client, undo, clientUndo } = await load()

    await clientUndo.asOneClientStep(async () => {
      client().setUnitName('')
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

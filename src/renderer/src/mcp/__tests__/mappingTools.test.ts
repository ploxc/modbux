// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ClientUnit,
  MAIN_CLIENT_UUID,
  RegisterData,
  RegisterType,
  defaultClientState,
  emptyRegisterMapping
} from '@shared'
import { ApiCall, recordApiCalls, stubRenderer } from '@renderer/context/__tests__/stubRenderer'
import type { PersistedClient } from '@renderer/context/client.zustand.types'

// The stores ask `window.api` as they load, so the stub goes first.
stubRenderer()
const calls: ApiCall[] = []
recordApiCalls(calls)

/** Main refuses the units it is handed while this is set, as it does ones it cannot parse. */
let mainRefusesMapping = false
const answering = window.api as unknown as Record<string, unknown>
window.api = new Proxy(
  {},
  {
    get: (_target, method: string): unknown =>
      method === 'setUnits' && mainRefusesMapping
        ? (): Promise<undefined> => Promise.resolve(undefined)
        : answering[method]
  }
) as never
const { answerCall } = await import('../relay')
const { holdSelection, useClientZustand } = await import('@renderer/context/client.zustand')
const { undoClient } = await import('@renderer/context/clientUndo')
const { sectionOf, useLiveZustand } = await import('@renderer/context/live.zustand')
const { MAIN_UNIT_UUID, readsConfiguration, shownType } =
  await import('@renderer/context/client.zustand')
const { useLayoutZustand } = await import('@renderer/context/layout.zustand')

const client = MAIN_CLIENT_UUID

/** The answer of a tool call, or the error it gave, thrown. */
const run = async (
  tool: Parameters<typeof answerCall>[0]['tool'],
  args: object
): Promise<unknown> => {
  const answer = await answerCall({ id: 'call', tool, args })
  if (!answer.ok) throw new Error(answer.error)
  return answer.result
}

const setState = (state: Partial<typeof defaultClientState>): void =>
  useLiveZustand.getState().setClientState(client, { ...defaultClientState, ...state })

const sent = (method: string): unknown[] =>
  calls.filter((call) => call.method === method).map((call) => call.payload)

const clientOf = (uuid: string = client): PersistedClient | undefined =>
  useClientZustand.getState().clients[uuid]

/** The one unit of a client, which is the one its view shows. */
const unitOf = (uuid: string = client): ClientUnit | undefined => clientOf(uuid)?.units[0]

/** The rows of the default unit's `type`. */
const rowsOf = (type: RegisterType): RegisterData[] =>
  sectionOf(useLiveZustand.getState(), client, MAIN_UNIT_UUID, type).registerData

/** A config file as a Save writes it. */
const savedConfig = {
  kind: 'client-device',
  version: 3,
  modbuxVersion: '3.0.0',
  name: 'Meter',
  littleEndian: true,
  registerMapping: {
    ...emptyRegisterMapping(),
    holding_registers: { 3: { dataType: 'int16', comment: 'power' } }
  }
}

beforeEach(async () => {
  setState({})
  const clientZustand = useClientZustand.getState()
  for (const uuid of Object.keys(clientZustand.clients)) {
    if (uuid !== client) await clientZustand.deleteClient(uuid)
  }
  clientZustand.setSelectedUuid(client)
  await clientZustand.init()
  clientZustand.setLayout('hr')
  await clientZustand.setLittleEndian(false)
  clientZustand.setName('')
  await clientZustand.clearRegisterMapping()
  calls.length = 0
  mainRefusesMapping = false
})

describe('add_client and delete_client', () => {
  it('opens the client view when it adds a client', async () => {
    useLayoutZustand.getState().setAppType(undefined)
    await run('add_client', {})
    expect(useLayoutZustand.getState().appType).toBe('client')
  })

  it('adds a client, puts it on screen and names it', async () => {
    const { client: added } = (await run('add_client', { name: 'Inverter' })) as { client: string }

    expect(useClientZustand.getState().selectedUuid).toBe(added)
    expect(clientOf(added)?.name).toBe('Inverter')
  })

  it('names the client it added when another call holds the selection', async () => {
    let error: unknown
    await holdSelection(async () => {
      error = await run('add_client', {}).catch((thrown: unknown) => thrown)
    })

    const [, added] = Object.keys(useClientZustand.getState().clients)
    expect(String(error)).toContain(`Added ${added}`)
    expect(useClientZustand.getState().selectedUuid).toBe(client)
  })

  it('removes a client and tells main', async () => {
    const { client: added } = (await run('add_client', {})) as { client: string }

    expect(await run('delete_client', { client: added })).toEqual({ deleted: added })
    expect(clientOf(added)).toBeUndefined()
    expect(sent('deleteClient')).toEqual([added])
  })

  it('refuses to remove a client while another call holds the selection', async () => {
    const { client: added } = (await run('add_client', {})) as { client: string }
    useClientZustand.getState().setSelectedUuid(client)

    await holdSelection(async () => {
      await expect(run('delete_client', { client: added })).rejects.toThrow('busy')
    })
    expect(clientOf(added)).toBeDefined()
  })

  it('refuses to remove the last client', async () => {
    await expect(run('delete_client', { client })).rejects.toThrow('last client')
    expect(clientOf()).toBeDefined()
    expect(sent('deleteClient')).toEqual([])
  })
})

describe('set_mapping_entry', () => {
  it('switches the client to the type named, and sets each field', async () => {
    const answer = await run('set_mapping_entry', {
      client,
      type: 'input_registers',
      address: 7,
      dataType: 'float',
      scalingFactor: 0.1,
      comment: 'frequency'
    })

    expect(answer).toEqual({ changed: ['dataType', 'scalingFactor', 'comment'], refused: [] })
    expect(shownType(useClientZustand.getState())).toBe('input_registers')
    expect(unitOf()?.registerMapping.input_registers[7]).toEqual({
      dataType: 'float',
      scalingFactor: 0.1,
      comment: 'frequency'
    })
  })

  it('takes only a comment on a coil, as the grid does', async () => {
    const answer = await run('set_mapping_entry', {
      client,
      type: 'coils',
      address: 2,
      dataType: 'int16',
      comment: 'pump'
    })

    expect(answer).toEqual({ changed: ['comment'], refused: ['dataType'] })
    expect(unitOf()?.registerMapping.coils[2]).toEqual({ comment: 'pump' })
  })

  it('removes a register for dataType none, and takes nothing else with it', async () => {
    await run('set_mapping_entry', { client, type: 'holding_registers', address: 3, comment: 'x' })

    const answer = await run('set_mapping_entry', {
      client,
      type: 'holding_registers',
      address: 3,
      dataType: 'none',
      comment: 'y'
    })

    expect(answer).toEqual({ changed: ['dataType'], refused: ['comment'] })
    expect(unitOf()?.registerMapping.holding_registers[3]).toBeUndefined()
  })

  it('refuses another type during a register scan, and leaves the grid', async () => {
    setState({ connectState: 'connected', scanningRegisters: true })
    useLiveZustand
      .getState()
      .setRegisterData(client, MAIN_UNIT_UUID, 'holding_registers', [{ id: 0 }] as never)

    await expect(
      run('set_mapping_entry', { client, type: 'coils', address: 0, comment: 'x' })
    ).rejects.toThrow('register scan')
    expect(shownType(useClientZustand.getState())).toBe('holding_registers')
    expect(rowsOf('holding_registers')).toHaveLength(1)
  })
})

describe('the type switch set_client_config shares', () => {
  it('shows the type named, and keeps the rows of the type before', async () => {
    useLiveZustand
      .getState()
      .setRegisterData(client, MAIN_UNIT_UUID, 'holding_registers', [{ id: 0 }] as never)
    await run('set_client_config', { client, type: 'coils' })
    expect(shownType(useClientZustand.getState())).toBe('coils')
    expect(rowsOf('coils')).toEqual([])
    expect(rowsOf('holding_registers')).toHaveLength(1)
  })

  it('leaves the grid when the type is the one it has', async () => {
    useLiveZustand
      .getState()
      .setRegisterData(client, MAIN_UNIT_UUID, 'holding_registers', [{ id: 0 }] as never)
    await run('set_client_config', { client, type: 'holding_registers' })
    expect(rowsOf('holding_registers')).toHaveLength(1)
  })
})

describe('replace_mapping and clear_mapping', () => {
  it('opens a saved config: name, byte order and mapping, and draws it', async () => {
    const answer = await run('replace_mapping', { client, config: savedConfig })

    expect(answer).toEqual({ migrated: false, fieldsNotBroughtAcross: [] })
    expect(clientOf()?.name).toBe('Meter')
    expect(unitOf()).toMatchObject({
      littleEndian: true,
      registerMapping: { holding_registers: { 3: { dataType: 'int16', comment: 'power' } } }
    })
    expect(rowsOf('holding_registers').map((row) => row.id)).toEqual([3])
  })

  it('turns read configuration off before it hands main the mapping', async () => {
    await run('set_mapping_entry', {
      client,
      type: 'holding_registers',
      address: 0,
      dataType: 'int16'
    })
    await run('set_client_config', { client, readConfiguration: true })
    calls.length = 0

    await run('replace_mapping', { client, config: savedConfig })

    expect(calls.map((call) => call.method)).toEqual([
      'setUnits',
      'setReadConfiguration',
      'setUnits'
    ])
    expect(readsConfiguration(useClientZustand.getState())).toBe(false)
  })

  it('is one step to undo', async () => {
    await run('replace_mapping', { client, config: savedConfig })
    await undoClient()
    expect(clientOf()?.name).toBe('')
    expect(unitOf()).toMatchObject({
      littleEndian: false,
      registerMapping: emptyRegisterMapping()
    })
  })

  it('migrates a version 1 config', async () => {
    const answer = await run('replace_mapping', {
      client,
      config: { ...emptyRegisterMapping(), holding_registers: { 5: { dataType: 'uint16' } } }
    })
    expect(answer).toMatchObject({ migrated: true })
    expect(unitOf()?.registerMapping.holding_registers[5]).toEqual({ dataType: 'uint16' })
  })

  it('refuses a config that is not one, and keeps the mapping', async () => {
    await run('replace_mapping', { client, config: savedConfig })

    await expect(
      run('replace_mapping', { client, config: { version: 2, registerMapping: 'nope' } })
    ).rejects.toThrow('The config was refused')
    expect(unitOf()?.registerMapping.holding_registers[3]).toBeDefined()
  })

  it('answers an error when main refuses the mapping, which stays as it was', async () => {
    mainRefusesMapping = true
    await expect(run('replace_mapping', { client, config: savedConfig })).rejects.toThrow(
      'refused the mapping'
    )
    expect(unitOf()?.registerMapping).toEqual(emptyRegisterMapping())
  })

  it('clears the name and the mapping, as one step to undo', async () => {
    await run('replace_mapping', { client, config: savedConfig })

    await run('clear_mapping', { client })
    expect(clientOf()?.name).toBe('')
    expect(unitOf()?.registerMapping).toEqual(emptyRegisterMapping())

    await undoClient()
    expect(clientOf()?.name).toBe('Meter')
    expect(unitOf()?.registerMapping).toMatchObject({
      holding_registers: { 3: { dataType: 'int16' } }
    })
  })
})

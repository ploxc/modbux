// @vitest-environment happy-dom
//
// The client store holds its clients in a record under the uuid main holds
// each under, with the one the view shows selected. What a store from before
// that shape comes back as, what a repair keeps, and which client a setter, an
// undo and main each reach.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLIENT_ZUSTAND_STORAGE_KEY,
  CURRENT_CLIENT_ZUSTAND_VERSION,
  MAIN_CLIENT_UUID,
  defaultConnectionConfig
} from '@shared'
import { ApiCall, clientPayload, recordApiCalls, stubRenderer } from './stubRenderer'
import {
  getDefaultClient,
  repairClients,
  selectedClient,
  selectedSession
} from '../client.zustand.helpers'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

const calls: ApiCall[] = []

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
  calls.length = 0
  recordApiCalls(calls)
})

const load = async (): Promise<{
  useClientZustand: typeof import('../client.zustand').useClientZustand
  useUndoZustand: typeof import('../undo.zustand').useUndoZustand
  clientUndo: typeof import('../clientUndo')
}> => {
  const { useClientZustand } = await import('../client.zustand')
  const { useUndoZustand } = await import('../undo.zustand')
  const clientUndo = await import('../clientUndo')
  return { useClientZustand, useUndoZustand, clientUndo }
}

/** A flat store, the shape every build before clients were keyed wrote. */
const flat = (version: number): string =>
  JSON.stringify({
    state: {
      name: 'boiler',
      connectionConfig: { ...defaultConnectionConfig, unitId: 7 },
      registerConfig: getDefaultClient().registerConfig,
      registerMapping: getDefaultClient().registerMapping
    },
    version
  })

describe('a store from before clients were keyed by uuid', () => {
  it.each([
    ['2.3.0 wrote', 2],
    ['this version wrote before the fold', CURRENT_CLIENT_ZUSTAND_VERSION]
  ])('comes back as one client, selected, when %s it', async (_label, version) => {
    localStorage.setItem(CLIENT_ZUSTAND_STORAGE_KEY, flat(version))

    const { useClientZustand } = await load()
    const state = useClientZustand.getState()

    expect(state.selectedUuid).toBe(MAIN_CLIENT_UUID)
    expect(Object.keys(state.clients)).toEqual([MAIN_CLIENT_UUID])
    expect(selectedClient(state).name).toBe('boiler')
    expect(selectedClient(state).connectionConfig.unitId).toBe(7)
    expect(state.configReset).toBeUndefined()
  })
})

describe('repairClients', () => {
  it('costs a field only the client it failed in', () => {
    const repaired = repairClients({
      selectedUuid: 'a',
      clients: {
        a: { ...getDefaultClient(), name: 'kept' },
        b: { ...getDefaultClient(), connectionConfig: {} as never }
      }
    })

    expect(repaired?.fields).toEqual(['connectionConfig'])
    expect(repaired?.selection.clients['a']?.name).toBe('kept')
    expect(repaired?.selection.clients['b']?.connectionConfig).toEqual(
      getDefaultClient().connectionConfig
    )
  })

  it('selects the first client when the selected uuid holds none', () => {
    const repaired = repairClients({
      selectedUuid: 'gone',
      clients: { a: getDefaultClient(), b: getDefaultClient() }
    })

    expect(repaired?.selection.selectedUuid).toBe('a')
  })

  it('selects the first client when the selected uuid is a name every object inherits', () => {
    const repaired = repairClients({
      selectedUuid: 'constructor',
      clients: { a: getDefaultClient() }
    })

    expect(repaired?.selection.selectedUuid).toBe('a')
  })

  it('makes the default client when none is left', () => {
    const repaired = repairClients({ selectedUuid: 'gone', clients: {} })

    expect(repaired?.selection.selectedUuid).toBe(MAIN_CLIENT_UUID)
    expect(Object.keys(repaired?.selection.clients ?? {})).toEqual([MAIN_CLIENT_UUID])
    expect(repaired?.fields).toEqual(['clients'])
  })
})

describe('selectedClient', () => {
  // `repairClients` keeps the selected uuid on a client, so this is a state set
  // another way, and a selector still answers one reference every read.
  it('answers the same default for a selected uuid that holds none', () => {
    const state = { selectedUuid: 'gone', clients: {} }
    expect(selectedClient(state)).toBe(selectedClient(state))
    expect(selectedClient(state).connectionConfig).toEqual(getDefaultClient().connectionConfig)
  })
})

describe('the clients a store holds', () => {
  it('hands every client to main at init', async () => {
    localStorage.setItem(
      CLIENT_ZUSTAND_STORAGE_KEY,
      JSON.stringify({
        state: { selectedUuid: 'a', clients: { a: getDefaultClient(), b: getDefaultClient() } },
        version: CURRENT_CLIENT_ZUSTAND_VERSION
      })
    )

    await load()

    const created = calls.filter(({ method }) => method === 'createClient')
    expect(created.map(({ payload }) => (payload as { uuid: string }).uuid)).toEqual(['a', 'b'])
  })

  it('adds a client, hands it to main and shows it', async () => {
    const { useClientZustand } = await load()

    const uuid = useClientZustand.getState().addClient()

    expect(useClientZustand.getState().selectedUuid).toBe(uuid)
    expect(
      calls.some(
        ({ method, payload }) =>
          method === 'createClient' && (payload as { uuid: string }).uuid === uuid
      )
    ).toBe(true)
    expect(useClientZustand.getState().sessions[uuid]?.ready).toBe(true)
  })

  it('keeps the last client', async () => {
    const { useClientZustand } = await load()

    expect(await useClientZustand.getState().deleteClient(MAIN_CLIENT_UUID)).toBe(false)
    expect(Object.keys(useClientZustand.getState().clients)).toEqual([MAIN_CLIENT_UUID])
  })

  it('takes a client away in main and here, and shows the first one left', async () => {
    const { useClientZustand } = await load()
    const uuid = useClientZustand.getState().addClient()

    expect(await useClientZustand.getState().deleteClient(uuid)).toBe(true)

    expect(calls.some(({ method, payload }) => method === 'deleteClient' && payload === uuid)).toBe(
      true
    )
    expect(Object.keys(useClientZustand.getState().clients)).toEqual([MAIN_CLIENT_UUID])
    expect(useClientZustand.getState().selectedUuid).toBe(MAIN_CLIENT_UUID)
  })

  it('shows only a client it holds', async () => {
    const { useClientZustand } = await load()

    useClientZustand.getState().setSelectedUuid('nobody')

    expect(useClientZustand.getState().selectedUuid).toBe(MAIN_CLIENT_UUID)
  })
})

describe('a setter whose answer lands after the view moved on', () => {
  it('writes the client it asked main about', async () => {
    const { useClientZustand } = await load()
    const other = useClientZustand.getState().addClient()
    useClientZustand.getState().setSelectedUuid(MAIN_CLIENT_UUID)

    const setting = useClientZustand.getState().setUnitId('9')
    useClientZustand.getState().setSelectedUuid(other)
    await setting

    const { clients } = useClientZustand.getState()
    expect(clients[MAIN_CLIENT_UUID]?.connectionConfig.unitId).toBe(9)
    expect(clients[other]?.connectionConfig.unitId).not.toBe(9)
    const sent = calls.filter(({ method }) => method === 'updateConnectionConfig').at(-1)
    expect((sent?.payload as { uuid: string }).uuid).toBe(MAIN_CLIENT_UUID)
    expect(sent && clientPayload(sent.payload)).toEqual({ unitId: 9 })
  })
})

describe('an undo of another client’s change', () => {
  it('shows that client and puts it back there', async () => {
    const { useClientZustand, clientUndo } = await load()
    await useClientZustand.getState().setUnitId('9')
    const other = useClientZustand.getState().addClient()
    expect(useClientZustand.getState().selectedUuid).toBe(other)

    await clientUndo.undoClient()

    expect(useClientZustand.getState().selectedUuid).toBe(MAIN_CLIENT_UUID)
    expect(useClientZustand.getState().clients[MAIN_CLIENT_UUID]?.connectionConfig.unitId).not.toBe(
      9
    )
  })

  // Left on the stack, it would refuse every undo after it.
  it('drops the steps of a client taken away', async () => {
    const { useClientZustand, useUndoZustand, clientUndo } = await load()
    const other = useClientZustand.getState().addClient()
    await useClientZustand.getState().setUnitId('9')
    useClientZustand.getState().setSelectedUuid(MAIN_CLIENT_UUID)
    await useClientZustand.getState().deleteClient(other)

    await clientUndo.undoClient()

    expect(useClientZustand.getState().selectedUuid).toBe(MAIN_CLIENT_UUID)
    expect(useUndoZustand.getState().client.past).toEqual([])
  })
})

describe('a stored store the repair finds nothing wrong in', () => {
  it('moves a selection that names no client onto one, and shows it', async () => {
    localStorage.setItem(
      CLIENT_ZUSTAND_STORAGE_KEY,
      JSON.stringify({
        state: { selectedUuid: 'gone', clients: { a: getDefaultClient() } },
        version: CURRENT_CLIENT_ZUSTAND_VERSION
      })
    )

    const { useClientZustand } = await load()
    const state = useClientZustand.getState()

    expect(state.selectedUuid).toBe('a')
    expect(selectedSession(state).ready).toBe(true)
    expect(state.configReset).toBeUndefined()
  })

  it('reports a client stored as an array rather than defaulting it quietly', async () => {
    localStorage.setItem(
      CLIENT_ZUSTAND_STORAGE_KEY,
      JSON.stringify({
        state: { selectedUuid: 'a', clients: { a: [] } },
        version: CURRENT_CLIENT_ZUSTAND_VERSION
      })
    )

    const { useClientZustand } = await load()

    expect(useClientZustand.getState().configReset?.fields).toContain('connectionConfig')
  })
})

describe('the undo runs of two clients', () => {
  it('keeps a host typed into another client as its own step', async () => {
    const { useClientZustand, useUndoZustand } = await load()
    await useClientZustand.getState().setHost('10.0.0.1', true)
    const other = useClientZustand.getState().addClient()
    await useClientZustand.getState().setHost('10.0.0.2', true)

    const steps = useUndoZustand.getState().client.past
    expect(steps.map((step) => step.uuid)).toEqual([MAIN_CLIENT_UUID, other])
  })
})

describe('the selection while a configuration is replaced', () => {
  it('holds still, and no client is taken away', async () => {
    const { useClientZustand, clientUndo } = await load()
    const other = useClientZustand.getState().addClient()
    useClientZustand.getState().setSelectedUuid(MAIN_CLIENT_UUID)

    let deleted: boolean | undefined
    await clientUndo.asOneClientStep(async () => {
      useClientZustand.getState().setSelectedUuid(other)
      deleted = await useClientZustand.getState().deleteClient(other)
    })

    expect(useClientZustand.getState().selectedUuid).toBe(MAIN_CLIENT_UUID)
    expect(deleted).toBe(false)
    expect(useClientZustand.getState().clients[other]).toBeDefined()
  })
})

describe('a client taken away while something of it is on its way', () => {
  it('sends a mapping edit that was waiting nowhere', async () => {
    vi.useFakeTimers()
    try {
      const { useClientZustand } = await load()
      const other = useClientZustand.getState().addClient()
      useClientZustand.getState().setRegisterMapping(3, 'comment', 'pump')
      // Main answers the delete only after the edit's timer has run out.
      const api = window.api
      window.api = new Proxy(api, {
        get: (target, method: string): unknown =>
          method === 'deleteClient'
            ? (): Promise<void> => new Promise(() => {})
            : Reflect.get(target, method)
      })

      void useClientZustand.getState().deleteClient(other)
      await vi.advanceTimersByTimeAsync(200)

      const sent = calls.filter(({ method }) => method === 'setRegisterMapping')
      expect(sent.map(({ payload }) => (payload as { uuid: string }).uuid)).not.toContain(other)
    } finally {
      vi.useRealTimers()
    }
  })

  it('records no step for a serial option main answers after the delete', async () => {
    const { useClientZustand, useUndoZustand } = await load()
    // The client shown after the delete holds a parity the deleted one did
    // not, so a step read off the wrong client would differ from its before.
    await useClientZustand.getState().setParity('odd')
    const other = useClientZustand.getState().addClient()

    const setting = useClientZustand.getState().setParity('even')
    await useClientZustand.getState().deleteClient(other)
    await setting

    const steps = useUndoZustand.getState().client.past
    expect(steps.map((step) => step.uuid)).not.toContain(other)
  })
})

describe('a store of more than one client', () => {
  it('records no step for a port main answers after the delete', async () => {
    const { useClientZustand, useUndoZustand } = await load()
    const other = useClientZustand.getState().addClient()

    const setting = useClientZustand.getState().setPort('1502')
    await useClientZustand.getState().deleteClient(other)
    await setting

    const steps = useUndoZustand.getState().client.past
    expect(steps.map((step) => step.uuid)).not.toContain(other)
  })

  it('selects the default client when the clients were reset whole', async () => {
    localStorage.setItem(
      CLIENT_ZUSTAND_STORAGE_KEY,
      JSON.stringify({
        state: { selectedUuid: 'gone', clients: [] },
        version: CURRENT_CLIENT_ZUSTAND_VERSION
      })
    )

    const { useClientZustand } = await load()
    const state = useClientZustand.getState()

    expect(state.selectedUuid).toBe(MAIN_CLIENT_UUID)
    expect(selectedSession(state).ready).toBe(true)
  })

  // The undo store is quiet during a server replay too, and that holds no
  // client setter.
  it('lets the selection move while only the server view replays', async () => {
    const { useClientZustand, useUndoZustand } = await load()
    const other = useClientZustand.getState().addClient()
    useClientZustand.getState().setSelectedUuid(MAIN_CLIENT_UUID)

    useUndoZustand.getState().beginQuiet()
    useClientZustand.getState().setSelectedUuid(other)
    useUndoZustand.getState().endQuiet()

    expect(useClientZustand.getState().selectedUuid).toBe(other)
  })
})

// Every record inherits `constructor`, so a check that reads it off the record
// finds a client there.
describe('a selection that names what every object inherits', () => {
  it('is moved onto a client when it was stored', async () => {
    localStorage.setItem(
      CLIENT_ZUSTAND_STORAGE_KEY,
      JSON.stringify({
        state: { selectedUuid: 'constructor', clients: { a: getDefaultClient() } },
        version: CURRENT_CLIENT_ZUSTAND_VERSION
      })
    )

    const { useClientZustand } = await load()

    expect(useClientZustand.getState().selectedUuid).toBe('a')
  })

  it('is no client to take away', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().addClient()

    expect(await useClientZustand.getState().deleteClient('constructor')).toBe(false)
    expect(calls.some(({ method }) => method === 'deleteClient')).toBe(false)
  })

  it('is not taken when asked for', async () => {
    const { useClientZustand } = await load()

    useClientZustand.getState().setSelectedUuid('constructor')

    expect(useClientZustand.getState().selectedUuid).toBe(MAIN_CLIENT_UUID)
  })
})

describe('a stored register config from before the backoff settings', () => {
  it('gets their defaults and loses nothing else', async () => {
    const client = getDefaultClient()
    const { offlineAfterTimeouts, maxPollInterval, ...older } = {
      ...client.registerConfig,
      address: 40
    }
    localStorage.setItem(
      CLIENT_ZUSTAND_STORAGE_KEY,
      JSON.stringify({
        state: {
          selectedUuid: MAIN_CLIENT_UUID,
          clients: { [MAIN_CLIENT_UUID]: { ...client, registerConfig: older } }
        },
        version: CURRENT_CLIENT_ZUSTAND_VERSION
      })
    )

    const { useClientZustand } = await load()
    const state = useClientZustand.getState()

    expect(state.configReset).toBeUndefined()
    expect(selectedClient(state).registerConfig).toMatchObject({
      address: 40,
      offlineAfterTimeouts,
      maxPollInterval
    })
  })
})

describe('an undo of a backoff setting', () => {
  it.each([
    ['offlineAfterTimeouts', 'setOfflineAfterTimeouts', 5],
    ['maxPollInterval', 'setMaxPollInterval', 120_000]
  ] as const)('puts %s back', async (field, setter, value) => {
    const { useClientZustand, clientUndo } = await load()
    const before = selectedClient(useClientZustand.getState()).registerConfig[field]

    expect(await useClientZustand.getState()[setter](value)).toBe(true)
    expect(selectedClient(useClientZustand.getState()).registerConfig[field]).toBe(value)
    await clientUndo.undoClient()

    const { offlineAfterTimeouts, maxPollInterval } = getDefaultClient().registerConfig
    expect(before).toBe(getDefaultClient().registerConfig[field])
    expect(selectedClient(useClientZustand.getState()).registerConfig).toMatchObject({
      offlineAfterTimeouts,
      maxPollInterval
    })
  })
})

describe('a stored register config that is not one', () => {
  it('is reported reset rather than defaulted quietly', async () => {
    localStorage.setItem(
      CLIENT_ZUSTAND_STORAGE_KEY,
      JSON.stringify({
        state: {
          selectedUuid: MAIN_CLIENT_UUID,
          clients: { [MAIN_CLIENT_UUID]: { ...getDefaultClient(), registerConfig: null } }
        },
        version: CURRENT_CLIENT_ZUSTAND_VERSION
      })
    )

    const { useClientZustand } = await load()

    expect(useClientZustand.getState().configReset?.fields).toContain('registerConfig')
  })
})

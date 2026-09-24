// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defaultClientState, MAIN_CLIENT_UUID } from '@shared'
import type { ClientState, RegisterMapping } from '@shared'

/**
 * The store registers its IPC listeners and calls `init()` at import time, so
 * both halves of `window` are stubbed before the import below.
 *
 * `ipcRenderer.on` keeps the handler rather than discarding it, because the
 * race these tests are about is a `client_state` push landing while `init`'s
 * question is still in flight, and firing that push is how the test reaches it.
 */
const handlers = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => void>()
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: {
      on: (
        channel: string,
        listener: (event: unknown, ...args: unknown[]) => void
      ): (() => void) => {
        handlers.set(channel, listener)
        return (): void => {
          handlers.delete(channel)
        }
      },
      send: (): void => {},
      invoke: async (): Promise<undefined> => undefined
    }
  }
  w.api = new Proxy({}, { get: (): (() => Promise<undefined>) => () => Promise.resolve(undefined) })
  return handlers
})

import { useClientZustand, getSelectedClient, getSelectedSession } from '../client.zustand'
import { useDataZustand } from '../data.zustand'
import { patchSelectedClient } from './selectedClient'
import { patchShownData, shownData } from './shownData'

const disconnected: ClientState = { ...defaultClientState }

const connectedAndPolling: ClientState = {
  ...defaultClientState,
  connectState: 'connected',
  polling: true
}

const pushClientState = (clientState: ClientState): void => {
  const handler = handlers.get('client_state')
  if (!handler) throw new Error('no client_state listener was registered')
  handler(undefined, { uuid: MAIN_CLIENT_UUID, clientState })
}

const stubApi = (): void => {
  window.api = {
    createClient: vi.fn(),
    updateConnectionConfig: vi.fn(),
    updateRegisterConfig: vi.fn(),
    setReadConfiguration: vi.fn(),
    getClientStates: vi.fn(() => new Promise<Record<string, ClientState>>(() => {}))
  } as never
}

beforeEach(() => {
  stubApi()
  patchSelectedClient(useClientZustand, {}, { ready: false })
  patchShownData(useDataZustand, { clientState: disconnected })
})

/**
 * What main answers about the client is `answeredClientState.test.ts`, because
 * `data.zustand` asks at import time rather than through `init`.
 */
describe('init hands main the config this window loaded', () => {
  it('is ready, has made its client, and has pushed both configs to it', () => {
    const connectionConfig = getSelectedClient().connectionConfig
    const registerConfig = getSelectedClient().registerConfig

    useClientZustand.getState().init()

    expect(getSelectedSession().ready).toBe(true)
    expect(getSelectedSession().readConfiguration).toBe(false)
    const uuid = MAIN_CLIENT_UUID
    expect(window.api.createClient).toHaveBeenCalledWith(uuid)
    expect(window.api.updateConnectionConfig).toHaveBeenCalledWith({ uuid, connectionConfig })
    expect(window.api.updateRegisterConfig).toHaveBeenCalledWith({ uuid, registerConfig })
    expect(window.api.setReadConfiguration).toHaveBeenCalledWith({
      uuid,
      readConfiguration: false
    })
  })
})

describe('the client_state listener', () => {
  it('leaves the store alone for a client it does not hold', () => {
    const before = shownData(useDataZustand).clientState
    const handler = handlers.get('client_state')
    if (!handler) throw new Error('no client_state listener was registered')

    handler(undefined, { uuid: 'another-client', clientState: connectedAndPolling })

    expect(shownData(useDataZustand).clientState).toBe(before)
  })

  it('writes what main pushed', () => {
    pushClientState(connectedAndPolling)

    expect(shownData(useDataZustand).clientState).toEqual(connectedAndPolling)
  })
})

describe('replacing the register mapping', () => {
  const mapping = (comment: string): RegisterMapping => ({
    coils: {},
    discrete_inputs: {},
    input_registers: {},
    holding_registers: { 0: { comment } }
  })

  const answerWith = (answer: true | undefined): ReturnType<typeof vi.fn> => {
    const setRegisterMapping = vi.fn(() => Promise.resolve(answer))
    window.api = { ...window.api, setRegisterMapping } as never
    return setRegisterMapping
  }

  // `ready` is what `setReadConfiguration` returns on, and the action turns read
  // configuration off before it asks. False here would leave that half of it out
  // of both tests.
  beforeEach(() => {
    patchSelectedClient(
      useClientZustand,
      { registerMapping: mapping('the one it had') },
      { ready: true, readConfiguration: true }
    )
  })

  it('writes the new one when main took it', async () => {
    answerWith(true)

    await useClientZustand.getState().replaceRegisterMapping(mapping('the new one'))

    expect(getSelectedClient().registerMapping.holding_registers[0]?.comment).toBe('the new one')
    expect(getSelectedSession().readConfiguration).toBe(false)
  })

  // Main keeps the mapping it had when it refuses one, so writing here would
  // leave the two reading different registers with nothing to say so.
  it('keeps the one it had when main refused the new one', async () => {
    const setRegisterMapping = answerWith(undefined)

    await useClientZustand.getState().replaceRegisterMapping(mapping('the new one'))

    expect(setRegisterMapping).toHaveBeenCalled()
    expect(getSelectedClient().registerMapping.holding_registers[0]?.comment).toBe('the one it had')
    // What the refusal costs: main and the store both hold the mapping from
    // before, and read configuration is off.
    expect(getSelectedSession().readConfiguration).toBe(false)
  })
})

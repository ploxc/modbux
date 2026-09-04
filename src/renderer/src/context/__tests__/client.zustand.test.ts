// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ClientState } from '@shared'

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

import { useClientZustand } from '../client.zustand'

const disconnected: ClientState = {
  connectState: 'disconnected',
  polling: false,
  scanningUnitIds: false,
  scanningRegisters: false
}

const connectedAndPolling: ClientState = {
  connectState: 'connected',
  polling: true,
  scanningUnitIds: false,
  scanningRegisters: false
}

const pushClientState = (clientState: ClientState): void => {
  const handler = handlers.get('client_state')
  if (!handler) throw new Error('no client_state listener was registered')
  handler(undefined, clientState)
}

/** The answer resolves only once this is called, so a push can land first. */
let answer: (clientState: ClientState) => void
const stubApi = (): void => {
  window.api = {
    updateConnectionConfig: vi.fn(),
    updateRegisterConfig: vi.fn(),
    setReadConfiguration: vi.fn(),
    getClientState: vi.fn(
      () =>
        new Promise<ClientState>((resolve) => {
          answer = resolve
        })
    )
  } as never
}

beforeEach(() => {
  stubApi()
  useClientZustand.setState({ ready: false, clientState: disconnected } as never)
})

describe('init asks main what the client is doing', () => {
  it('takes the answer, so a window opened after the last push catches up', async () => {
    const initialised = useClientZustand.getState().init()
    answer(connectedAndPolling)
    await initialised

    expect(useClientZustand.getState().clientState).toEqual(connectedAndPolling)
  })

  it('keeps a push that landed while the answer was in flight', async () => {
    const initialised = useClientZustand.getState().init()

    const scanning: ClientState = {
      ...connectedAndPolling,
      polling: false,
      scanningRegisters: true
    }
    pushClientState(scanning)
    answer(connectedAndPolling)
    await initialised

    expect(useClientZustand.getState().clientState).toEqual(scanning)
  })

  it('leaves the state alone when main does not answer', async () => {
    window.api = {
      ...window.api,
      getClientState: vi.fn(() => Promise.reject(new Error('no handler registered')))
    } as never

    await expect(useClientZustand.getState().init()).resolves.toBeUndefined()
    expect(useClientZustand.getState().clientState).toEqual(disconnected)
  })

  /**
   * The half that has to keep working, so it asserts what `init` did before it
   * asked anything and never touches the answer. A change to the question must
   * leave this green.
   */
  it('is ready and has pushed both configs before it asks', () => {
    const connectionConfig = useClientZustand.getState().connectionConfig
    const registerConfig = useClientZustand.getState().registerConfig

    void useClientZustand.getState().init()

    expect(useClientZustand.getState().ready).toBe(true)
    expect(useClientZustand.getState().readConfiguration).toBe(false)
    expect(window.api.updateConnectionConfig).toHaveBeenCalledWith(connectionConfig)
    expect(window.api.updateRegisterConfig).toHaveBeenCalledWith(registerConfig)
    expect(window.api.setReadConfiguration).toHaveBeenCalledWith(false)
  })
})

describe('the client_state listener', () => {
  it('writes what main pushed', () => {
    pushClientState(connectedAndPolling)

    expect(useClientZustand.getState().clientState).toEqual(connectedAndPolling)
  })
})

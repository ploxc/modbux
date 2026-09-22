// @vitest-environment happy-dom
//
// Main pushes `client_state` on a change, so a window opened after the last
// push starts on the initial literal. `data.zustand` asks once at import time
// for what main holds now, and a push that lands while that answer is in
// flight is the newer of the two.
//
// The ask sits there rather than in `client.zustand`'s `init` because the two
// modules import each other: entered through `data.zustand`, `client.zustand`
// runs to the end of its tail while `data.zustand` is still evaluating, and a
// name reached back across the cycle at that moment is in its temporal dead
// zone. `init` named one and the throw went into its catch, so on macos the
// window that came back after the last one closed read Connect over a client
// that was connected and polling.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState } from '@shared'
import type { ClientState } from '@shared'

const disconnected: ClientState = { ...defaultClientState }

const connectedAndPolling: ClientState = {
  ...defaultClientState,
  connectState: 'connected',
  polling: true
}

const scanning: ClientState = {
  ...defaultClientState,
  connectState: 'connected',
  scanningRegisters: true
}

/** The `client_state` listener the store registered, so a test can push. */
let pushed: ((event: unknown, clientState: ClientState) => void) | undefined

/** Resolves the answer to `get_client_state`, so a push can land first. */
let answer: (clientState: ClientState) => void
let refuse: (error: Error) => void

/**
 * The window both stores find at import time.
 *
 * `isServerWindow` is a boolean the preload exposes rather than a channel, and
 * a function in its place is truthy, which would leave both tails taking this
 * for the split out window.
 */
const stub = ({ isServerWindow = false }: { isServerWindow?: boolean } = {}): void => {
  pushed = undefined
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: {
      on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        if (channel === 'client_state')
          pushed = listener as (event: unknown, clientState: ClientState) => void
        return (): void => {}
      },
      send: (): void => {}
    }
  }
  w.api = new Proxy(
    {},
    {
      get: (_target, method: string): unknown =>
        method === 'isServerWindow'
          ? isServerWindow
          : method === 'getClientState'
            ? (): Promise<ClientState> =>
                new Promise<ClientState>((resolve, reject) => {
                  answer = resolve
                  refuse = reject
                })
            : (): Promise<undefined> => Promise.resolve(undefined)
    }
  )
}

const push = (clientState: ClientState): void => {
  if (!pushed) throw new Error('no client_state listener was registered')
  pushed(undefined, clientState)
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  ;(globalThis as { window?: unknown }).window ??= globalThis
  stub()
})

describe('the client state main answers with', () => {
  // Both halves of the cycle, because which one a window enters through is the
  // bundler's to decide and the answer reached the store through only one.
  it.each(['../data.zustand', '../client.zustand'])(
    'reaches the store through %s',
    async (entry) => {
      await import(entry)
      const { useDataZustand } = await import('../data.zustand')

      answer(connectedAndPolling)

      await vi.waitFor(() =>
        expect(useDataZustand.getState().clientState).toEqual(connectedAndPolling)
      )
    }
  )

  it('loses to a push that landed while it was in flight', async () => {
    const { useDataZustand } = await import('../data.zustand')

    push(scanning)
    answer(connectedAndPolling)

    await vi.waitFor(() => expect(useDataZustand.getState().clientState).toEqual(scanning))
  })

  it('leaves the state alone when main does not answer', async () => {
    const { useDataZustand } = await import('../data.zustand')

    refuse(new Error('no handler registered'))

    await vi.waitFor(() => expect(useDataZustand.getState().clientState).toEqual(disconnected))
  })
})

describe('the split out server window', () => {
  // `client_state` is about the one client main holds, and that window shows
  // none of it. The guard is the one `init` carries.
  it('asks nothing', async () => {
    stub({ isServerWindow: true })
    const invoked: string[] = []
    const answers = window.api as unknown as Record<string, unknown>
    window.api = new Proxy(
      {},
      {
        get: (_target, method: string): unknown => {
          if (method === 'isServerWindow') return true
          invoked.push(method)
          return answers[method]
        }
      }
    ) as never

    await import('../data.zustand')

    expect(invoked).not.toContain('getClientState')
  })
})

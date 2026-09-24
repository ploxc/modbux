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
import { defaultClientState, MAIN_CLIENT_UUID } from '@shared'
import type { ClientState } from '@shared'
import { shownData } from './shownData'

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
let pushed: ((event: unknown, push: { uuid: string; clientState: ClientState }) => void) | undefined

/** Resolves the answer to `get_client_states`, so a push can land first. */
let answer: (clientState: ClientState) => void
/** Resolves it with no client in it, which a fresh launch answers. */
let answerEmpty: () => void
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
        if (channel === 'client_state') pushed = listener as typeof pushed
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
          : method === 'getClientStates'
            ? (): Promise<Record<string, ClientState>> =>
                new Promise<Record<string, ClientState>>((resolve, reject) => {
                  answer = (clientState): void => resolve({ [MAIN_CLIENT_UUID]: clientState })
                  answerEmpty = (): void => resolve({})
                  refuse = reject
                })
            : (): Promise<undefined> => Promise.resolve(undefined)
    }
  )
}

const push = (clientState: ClientState): void => {
  if (!pushed) throw new Error('no client_state listener was registered')
  pushed(undefined, { uuid: MAIN_CLIENT_UUID, clientState })
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
        expect(shownData(useDataZustand).clientState).toEqual(connectedAndPolling)
      )
    }
  )

  // `data.zustand` finishes before `client.zustand`'s `init`, so on a fresh
  // launch the ask goes out before the client exists, and main answers with
  // no client in it.
  it('leaves the state alone when main holds no client yet', async () => {
    const { useDataZustand } = await import('../data.zustand')
    const before = shownData(useDataZustand).clientState

    answerEmpty()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(shownData(useDataZustand).clientState).toBe(before)
  })

  it('loses to a push that landed while it was in flight', async () => {
    const { useDataZustand } = await import('../data.zustand')

    push(scanning)
    answer(connectedAndPolling)

    await vi.waitFor(() => expect(shownData(useDataZustand).clientState).toEqual(scanning))
  })

  // The refusal is what this waits for, because the state it leaves behind is
  // the state it started on: waiting on that alone passes on the first attempt,
  // before the rejection has been handled at all.
  it('leaves the state alone when main does not answer', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { useDataZustand } = await import('../data.zustand')

    refuse(new Error('no handler registered'))

    await vi.waitFor(() => expect(reported).toHaveBeenCalled())
    expect(shownData(useDataZustand).clientState).toEqual(disconnected)
    reported.mockRestore()
  })
})

/**
 * Which window asks, recorded on the one property the tails read before they
 * decide.
 *
 * `isServerWindow` has to answer before the recording, because reading it is
 * what the guard does and a window that reads nothing else would look the same
 * as one that asked nothing.
 */
const methodsAsked = (isServerWindow: boolean): string[] => {
  stub({ isServerWindow })
  const asked: string[] = []
  const answers = window.api as unknown as Record<string, unknown>
  window.api = new Proxy(
    {},
    {
      get: (_target, method: string): unknown => {
        if (method === 'isServerWindow') return isServerWindow
        asked.push(method)
        return answers[method]
      }
    }
  ) as never
  return asked
}

describe('the window that asks main what the client is doing', () => {
  // The split out server window shows no client. The guard is the one `init`
  // carries.
  it.each([
    [false, true],
    [true, false]
  ])('is the server window: %s, so it asks: %s', async (isServerWindow, asks) => {
    const asked = methodsAsked(isServerWindow)

    await import('../data.zustand')

    expect(asked.includes('getClientStates')).toBe(asks)
  })
})

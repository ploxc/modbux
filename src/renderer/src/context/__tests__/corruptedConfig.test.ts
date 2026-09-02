// @vitest-environment happy-dom
//
// A store whose persisted config fails its schema resets itself at module scope,
// which is before React has rendered and therefore before notistack has a
// provider. Reporting from there threw out of module evaluation and took the
// rest of the file with it: no init, no event listeners, and no render, so the
// window came up blank with no UI left to clear the bad config from.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stubRenderer = (): void => {
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: {
      on: (): (() => void) => (): void => {},
      send: (): void => {},
      invoke: async (): Promise<undefined> => undefined
    }
  }
  w.api = new Proxy({}, { get: () => (): Promise<undefined> => Promise.resolve(undefined) })
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('a persisted client config that fails its schema', () => {
  it('lets the module finish evaluating', async () => {
    localStorage.setItem(
      'client.zustand',
      JSON.stringify({ state: { connectionConfig: {} }, version: 2 })
    )

    const { useClientZustand } = await import('../client.zustand')

    expect(useClientZustand.getState().configWasReset).toBe(true)
  })

  it('leaves the store on its defaults rather than the broken config', async () => {
    localStorage.setItem(
      'client.zustand',
      JSON.stringify({ state: { connectionConfig: {} }, version: 2 })
    )

    const { useClientZustand } = await import('../client.zustand')

    expect(useClientZustand.getState().connectionConfig.protocol).toBeDefined()
  })

  it('says nothing when the config parses', async () => {
    const { useClientZustand } = await import('../client.zustand')

    expect(useClientZustand.getState().configWasReset).toBe(false)
  })
})

describe('a persisted server config that fails its schema', () => {
  it('lets the module finish evaluating', async () => {
    localStorage.setItem('server.zustand', JSON.stringify({ state: { port: 'nope' }, version: 3 }))

    const { useServerZustand } = await import('../server.zustand')

    expect(useServerZustand.getState().configWasReset).toBe(true)
  })

  it('says nothing when the config parses', async () => {
    const { useServerZustand } = await import('../server.zustand')

    expect(useServerZustand.getState().configWasReset).toBe(false)
  })
})

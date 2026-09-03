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

/** A mapping a user would have built by hand, and would not want to lose. */
const mapping = {
  coils: {},
  discrete_inputs: {},
  input_registers: {},
  holding_registers: { '5': { dataType: 'uint16', comment: 'Feeder A' } }
}

describe('a persisted client config with one field that fails its schema', () => {
  it('lets the module finish evaluating', async () => {
    localStorage.setItem(
      'client.zustand',
      JSON.stringify({ state: { connectionConfig: {} }, version: 2 })
    )

    const { useClientZustand } = await import('../client.zustand')

    expect(useClientZustand.getState().configReset).toBeDefined()
  })

  it('names the field it reset', async () => {
    localStorage.setItem(
      'client.zustand',
      JSON.stringify({ state: { connectionConfig: {} }, version: 2 })
    )

    const { useClientZustand } = await import('../client.zustand')

    expect(useClientZustand.getState().configReset?.fields).toEqual(['connectionConfig'])
  })

  it('defaults that field rather than leaving the broken one', async () => {
    localStorage.setItem(
      'client.zustand',
      JSON.stringify({ state: { connectionConfig: {} }, version: 2 })
    )

    const { useClientZustand } = await import('../client.zustand')

    expect(useClientZustand.getState().connectionConfig.protocol).toBeDefined()
  })

  it('keeps the register mapping standing beside it', async () => {
    localStorage.setItem(
      'client.zustand',
      JSON.stringify({ state: { connectionConfig: {}, registerMapping: mapping }, version: 2 })
    )

    const { useClientZustand } = await import('../client.zustand')

    expect(useClientZustand.getState().registerMapping.holding_registers[5]?.comment).toBe(
      'Feeder A'
    )
  })

  it('copies the unreadable blob rather than clearing it', async () => {
    const stored = JSON.stringify({ state: { connectionConfig: {} }, version: 2 })
    localStorage.setItem('client.zustand', stored)

    await import('../client.zustand')

    const kept = Object.keys(localStorage).filter((k) => k.startsWith('client.zustand.corrupt-'))
    expect(kept).toHaveLength(1)
    expect(localStorage.getItem(kept[0])).toBe(stored)
  })

  it('says nothing when the config parses', async () => {
    const { useClientZustand } = await import('../client.zustand')

    expect(useClientZustand.getState().configReset).toBeUndefined()
  })
})

describe('a persisted client config from a newer version', () => {
  it('keeps the fields that still fit and says where it came from', async () => {
    localStorage.setItem(
      'client.zustand',
      JSON.stringify({ state: { registerMapping: mapping, connectionConfig: {} }, version: 99 })
    )

    const { useClientZustand } = await import('../client.zustand')

    const reset = useClientZustand.getState().configReset
    expect(reset?.savedByNewerVersion).toBe(true)
    expect(reset?.fields).toEqual(['connectionConfig'])
    expect(useClientZustand.getState().registerMapping.holding_registers[5]?.comment).toBe(
      'Feeder A'
    )
  })

  it('reports it even when every field still fits', async () => {
    const { useClientZustand: fresh } = await import('../client.zustand')
    const whole = JSON.stringify({
      state: {
        name: '',
        registerMapping: fresh.getInitialState().registerMapping,
        connectionConfig: fresh.getInitialState().connectionConfig,
        registerConfig: fresh.getInitialState().registerConfig
      },
      version: 99
    })
    vi.resetModules()
    localStorage.clear()
    stubRenderer()
    localStorage.setItem('client.zustand', whole)

    const { useClientZustand } = await import('../client.zustand')

    expect(useClientZustand.getState().configReset).toEqual({
      fields: [],
      savedByNewerVersion: true
    })
  })
})

describe('a persisted server config with one field that fails its schema', () => {
  it('lets the module finish evaluating', async () => {
    localStorage.setItem('server.zustand', JSON.stringify({ state: { port: 'nope' }, version: 3 }))

    const { useServerZustand } = await import('../server.zustand')

    expect(useServerZustand.getState().configReset?.fields).toContain('port')
  })

  it('says nothing when the config parses', async () => {
    const { useServerZustand } = await import('../server.zustand')

    expect(useServerZustand.getState().configReset).toBeUndefined()
  })
})

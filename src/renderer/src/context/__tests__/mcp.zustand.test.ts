// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiCall, recordApiCalls, stubRenderer } from './stubRenderer'

const calls: ApiCall[] = []

const load = async (
  options: { isServerWindow?: boolean } = {}
): Promise<typeof import('../mcp.zustand')> => {
  stubRenderer(options)
  recordApiCalls(calls)
  const store = await import('../mcp.zustand')
  await vi.waitFor(() =>
    expect(calls.length).toBeGreaterThanOrEqual(options.isServerWindow ? 0 : 1)
  )
  return store
}

const settingsSent = (): unknown[] =>
  calls.filter((call) => call.method === 'setMcpSettings').map((call) => call.payload)

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  calls.length = 0
})

describe('the MCP settings store', () => {
  it('hands main every box off, the default port and no token on a first start', async () => {
    const { useMcpZustand } = await load()
    expect(settingsSent()).toEqual([
      { access: { read: false, operate: false, write: false }, port: 7502, tokenHash: undefined }
    ])
    expect(useMcpZustand.getState().status).toEqual({ listening: false })
  })

  it('hands main what it stored last time', async () => {
    localStorage.setItem(
      'mcp.zustand',
      JSON.stringify({
        state: {
          access: { read: true, operate: false, write: false },
          port: 7600,
          tokenHash: 'b'.repeat(64)
        },
        version: 1
      })
    )
    await load()
    expect(settingsSent()).toEqual([
      {
        access: { read: true, operate: false, write: false },
        port: 7600,
        tokenHash: 'b'.repeat(64)
      }
    ])
  })

  it('starts with every box off when what it stored does not parse', async () => {
    localStorage.setItem(
      'mcp.zustand',
      JSON.stringify({ state: { access: { read: 'yes' }, port: 7600 }, version: 1 })
    )
    const { useMcpZustand } = await load()
    expect(useMcpZustand.getState().access).toEqual({ read: false, operate: false, write: false })
    expect(useMcpZustand.getState().port).toBe(7502)
  })

  it('listens once a token is made and a box is ticked, and says so', async () => {
    const { useMcpZustand } = await load()
    await useMcpZustand.getState().createToken()
    await useMcpZustand.getState().setAccess('read', true)

    expect(settingsSent().at(-1)).toEqual({
      access: { read: true, operate: false, write: false },
      port: 7502,
      tokenHash: 'a'.repeat(64)
    })
    expect(useMcpZustand.getState().status).toEqual({ listening: true })
    expect(useMcpZustand.getState().shownToken).toBe('mbx_test')
  })

  it('keeps the digest and never the token', async () => {
    const { useMcpZustand } = await load()
    await useMcpZustand.getState().createToken()
    const stored = localStorage.getItem('mcp.zustand') ?? ''
    expect(stored).toContain('a'.repeat(64))
    expect(stored).not.toContain('mbx_test')
  })

  it('forgets the token it showed', async () => {
    const { useMcpZustand } = await load()
    await useMcpZustand.getState().createToken()
    useMcpZustand.getState().forgetShownToken()
    expect(useMcpZustand.getState().shownToken).toBeUndefined()
  })

  it('hands main a new port', async () => {
    const { useMcpZustand } = await load()
    await useMcpZustand.getState().setPort(7600)
    expect(settingsSent().at(-1)).toMatchObject({ port: 7600 })
  })

  // Both windows evaluate this module; two of them handing main settings
  // would have the one that loaded last decide.
  it('hands main nothing from the split out server window', async () => {
    const { useMcpZustand } = await load({ isServerWindow: true })
    await useMcpZustand.getState().setAccess('read', true)
    expect(settingsSent()).toEqual([])
  })
})

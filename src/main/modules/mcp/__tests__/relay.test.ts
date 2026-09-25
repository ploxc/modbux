import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpCall } from '@shared'
import type { Windows } from '../../../windows'
import { McpRelay } from '../relay'

describe('McpRelay', () => {
  let send: ReturnType<typeof vi.fn>
  let relay: McpRelay

  /** The call the relay sent last, and who it went to. */
  const lastSent = (): { call: McpCall; to: unknown } => {
    const [event, call, to] = send.mock.calls.at(-1) ?? []
    if (event !== 'mcp_call') throw new Error('the relay sent no mcp_call')
    return { call: call as McpCall, to }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    send = vi.fn()
    relay = new McpRelay({ windows: { send } as unknown as Windows, timeout: 5000 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends a client tool to the main window', () => {
    void relay.run('client', 'list_clients', {})
    expect(lastSent()).toMatchObject({ call: { tool: 'list_clients', args: {} }, to: 'main' })
  })

  it('sends a server tool to the window showing the server', () => {
    void relay.run('server', 'list_servers', {})
    expect(lastSent().to).toBe('serverView')
  })

  it('answers what the window answered under the call id', async () => {
    const answer = relay.run('client', 'get_client', { client: 'a' })
    const { call } = lastSent()
    relay.answer({ id: call.id, ok: true, result: { name: 'meter' } })
    await expect(answer).resolves.toEqual({ ok: true, result: { name: 'meter' } })
  })

  it('passes an error on', async () => {
    const answer = relay.run('client', 'get_client', { client: 'a' })
    relay.answer({ id: lastSent().call.id, ok: false, error: 'no such client' })
    await expect(answer).resolves.toEqual({ ok: false, error: 'no such client' })
  })

  it('keeps two calls apart', async () => {
    const first = relay.run('client', 'list_clients', {})
    const firstId = lastSent().call.id
    const second = relay.run('client', 'list_registers', { client: 'a' })
    const secondId = lastSent().call.id

    relay.answer({ id: secondId, ok: true, result: 2 })
    relay.answer({ id: firstId, ok: true, result: 1 })

    await expect(first).resolves.toEqual({ ok: true, result: 1 })
    await expect(second).resolves.toEqual({ ok: true, result: 2 })
  })

  it('says so when no window answers in time', async () => {
    const answer = relay.run('server', 'list_servers', {})
    await vi.advanceTimersByTimeAsync(5000)
    await expect(answer).resolves.toEqual({
      ok: false,
      error: 'No Modbux window answered list_servers within 5 s. Is a window open?'
    })
  })

  it('drops an answer that came after the timeout', async () => {
    const answer = relay.run('client', 'list_clients', {})
    const { id } = lastSent().call
    await vi.advanceTimersByTimeAsync(5000)
    relay.answer({ id, ok: true, result: 'late' })
    await expect(answer).resolves.toMatchObject({ ok: false })
  })

  it('waits the whole timeout before giving up', async () => {
    const answer = relay.run('client', 'list_clients', {})
    const { id } = lastSent().call
    await vi.advanceTimersByTimeAsync(4999)
    relay.answer({ id, ok: true, result: 'in time' })
    await expect(answer).resolves.toEqual({ ok: true, result: 'in time' })
  })

  it('leaves no timer behind once answered', () => {
    void relay.run('client', 'list_clients', {})
    relay.answer({ id: lastSent().call.id, ok: true, result: [] })
    expect(vi.getTimerCount()).toBe(0)
  })
})

// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, stubRenderer } from '@renderer/context/__tests__/stubRenderer'

stubRenderer()
const { answerCall, installMcpRelay } = await import('../relay')
const { useClientZustand } = await import('@renderer/context/client.zustand')

describe('answerCall', () => {
  it('answers a tool with what it found, under the call id', async () => {
    const [id] = Object.keys(useClientZustand.getState().clients)
    const answer = await answerCall({ id: 'call-1', tool: 'list_clients', args: {} })
    expect(answer).toMatchObject({ id: 'call-1', ok: true, result: [{ id }] })
  })

  it('answers the window and every element with a data-testid', async () => {
    document.body.innerHTML = '<button data-testid="probe-btn">Probe</button>'
    const answer = await answerCall({ id: 'call-4', tool: 'inspect_layout', args: {} })
    expect(answer).toMatchObject({
      id: 'call-4',
      ok: true,
      result: {
        window: { width: window.innerWidth, height: window.innerHeight },
        elements: [{ testId: 'probe-btn' }]
      }
    })
  })

  it('answers a mistake in what was asked with its own message', async () => {
    expect(
      await answerCall({ id: 'call-2', tool: 'get_client', args: { client: 'nobody' } })
    ).toEqual({
      id: 'call-2',
      ok: false,
      error: 'No client has the id nobody; list_clients names them'
    })
  })

  it('names the tool when something else went wrong', async () => {
    const answer = await answerCall({ id: 'call-3', tool: 'get_client', args: { client: 7 } })
    expect(answer).toMatchObject({ id: 'call-3', ok: false })
    expect(answer.ok || answer.error.startsWith('get_client failed in Modbux:')).toBe(true)
  })
})

describe('installMcpRelay', () => {
  it('takes a call before it answers it, so main waits for the tool rather than for a window', async () => {
    const sent: unknown[][] = []
    const ipcRenderer = (window as unknown as { electron: { ipcRenderer: { send: unknown } } })
      .electron.ipcRenderer
    ipcRenderer.send = (...args: unknown[]): void => void sent.push(args)
    installMcpRelay()

    fireEvent('mcp_call', { id: 'call-4', tool: 'list_clients', args: {} })
    expect(sent).toEqual([['mcp_ack', 'call-4']])
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]).toMatchObject(['mcp_result', { id: 'call-4', ok: true }])
  })
})

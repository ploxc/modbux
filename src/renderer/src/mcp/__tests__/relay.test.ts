// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { stubRenderer } from '@renderer/context/__tests__/stubRenderer'

stubRenderer()
const { answerCall } = await import('../relay')
const { useClientZustand } = await import('@renderer/context/client.zustand')

describe('answerCall', () => {
  it('answers a tool with what it found, under the call id', async () => {
    const [id] = Object.keys(useClientZustand.getState().clients)
    const answer = await answerCall({ id: 'call-1', tool: 'list_clients', args: {} })
    expect(answer).toMatchObject({ id: 'call-1', ok: true, result: [{ id }] })
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

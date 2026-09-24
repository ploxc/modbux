// @vitest-environment happy-dom
//
// An invalid host, port name or length is written at once and a valid one only
// once main answers, so the answer to a valid key can arrive after a later
// invalid key has been written.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from './stubRenderer'
import { selectedClient } from '../client.zustand.helpers'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

/** Holds every answer on `method` until the test lets it go. */
const holdAnswers = (method: string): { release: () => Promise<void> } => {
  const underneath = window.api as unknown as Record<string, unknown>
  const held: Array<() => void> = []
  window.api = new Proxy(
    {},
    {
      get: (_target, name: string): unknown =>
        name === method
          ? (payload: unknown): Promise<unknown> =>
              new Promise((resolve) => {
                const answer = underneath[name] as (payload: unknown) => Promise<unknown>
                held.push(() => resolve(answer(payload)))
              })
          : underneath[name]
    }
  ) as never
  return {
    release: async (): Promise<void> => {
      for (const answer of held.splice(0)) answer()
      await vi.waitFor(() => expect(held).toEqual([]))
    }
  }
}

const loadClient = async (): Promise<typeof import('../client.zustand').useClientZustand> => {
  const { useClientZustand } = await import('../client.zustand')
  await import('../data.zustand')
  return useClientZustand
}

describe('an answer a later invalid value has superseded', () => {
  it('leaves the host the field shows', async () => {
    const useClientZustand = await loadClient()
    const { release } = holdAnswers('updateConnectionConfig')

    const valid = useClientZustand.getState().setHost('10.0.0.5', true)
    await useClientZustand.getState().setHost('10.0.0.', false)
    await release()

    expect(await valid).toBe(false)
    expect(selectedClient(useClientZustand.getState()).connectionConfig.tcp.host).toBe('10.0.0.')
  })

  it('leaves the port name the field shows', async () => {
    const useClientZustand = await loadClient()
    const { release } = holdAnswers('updateConnectionConfig')

    const valid = useClientZustand.getState().setCom('COM3', true)
    await useClientZustand.getState().setCom('', false)
    await release()

    expect(await valid).toBe(false)
    expect(selectedClient(useClientZustand.getState()).connectionConfig.rtu.com).toBe('')
  })

  it('leaves the length the field shows', async () => {
    const useClientZustand = await loadClient()
    const { release } = holdAnswers('updateRegisterConfig')

    const valid = useClientZustand.getState().setLength('12', true)
    await useClientZustand.getState().setLength('0', false)
    await release()

    expect(await valid).toBe(false)
    expect(selectedClient(useClientZustand.getState()).registerConfig.length).toBe(0)
  })
})

describe('an answer nothing has superseded', () => {
  it('writes the host once main answers', async () => {
    const useClientZustand = await loadClient()
    const { release } = holdAnswers('updateConnectionConfig')

    const valid = useClientZustand.getState().setHost('10.0.0.5', true)
    await release()

    expect(await valid).toBe(true)
    expect(selectedClient(useClientZustand.getState()).connectionConfig.tcp.host).toBe('10.0.0.5')
  })
})

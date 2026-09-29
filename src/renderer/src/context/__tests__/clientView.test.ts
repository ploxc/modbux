// @vitest-environment happy-dom
//
// The view the window shows is kept across launches, and a stored view that
// does not parse leaves Debug.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from './stubRenderer'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

const load = async (): Promise<(typeof import('../clientView.zustand'))['useClientViewZustand']> =>
  (await import('../clientView.zustand')).useClientViewZustand

describe('the client view', () => {
  it('opens on Debug the first time', async () => {
    expect((await load()).getState().view).toBe('debug')
  })

  it('opens on the view chosen before the window closed', async () => {
    ;(await load()).getState().setView('monitor')
    vi.resetModules()

    expect((await load()).getState().view).toBe('monitor')
  })

  it('opens on Debug when the stored view is not one it knows', async () => {
    localStorage.setItem(
      'clientView.zustand',
      JSON.stringify({ state: { view: 'grid' }, version: 1 })
    )

    expect((await load()).getState().view).toBe('debug')
  })
})

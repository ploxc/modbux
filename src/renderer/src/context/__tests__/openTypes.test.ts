// @vitest-environment happy-dom
//
// One or two register types are on screen, and one of them is the type the
// view acts on. None of it goes to main.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from './stubRenderer'
import { selectedSession } from '../client.zustand.helpers'

const load = async (): Promise<typeof import('../client.zustand').useClientZustand> =>
  (await import('../client.zustand')).useClientZustand

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

const session = (store: Awaited<ReturnType<typeof load>>): ReturnType<typeof selectedSession> =>
  selectedSession(store.getState())

describe('one type on screen', () => {
  it('is replaced by the type pressed, which the view then acts on', async () => {
    const store = await load()
    store.getState().setType('coils')

    expect(session(store).openTypes).toEqual(['coils'])
    expect(session(store).shownType).toBe('coils')
  })
})

describe('two types side by side', () => {
  it('open the type after the one on screen, in the order of the buttons', async () => {
    const store = await load()
    store.getState().setSideBySide(true)

    expect(session(store).openTypes).toEqual(['holding_registers', 'input_registers'])
    expect(session(store).shownType).toBe('holding_registers')
  })

  it('take a third type beside the one used last', async () => {
    const store = await load()
    store.getState().setSideBySide(true)
    store.getState().focusType('input_registers')
    store.getState().setType('coils')

    expect(session(store).openTypes).toEqual(['input_registers', 'coils'])
    expect(session(store).shownType).toBe('coils')
  })

  it('act on the one pressed into, and on no type that is not open', async () => {
    const store = await load()
    store.getState().setSideBySide(true)
    store.getState().focusType('input_registers')
    store.getState().focusType('coils')

    expect(session(store).shownType).toBe('input_registers')
  })

  it('go back to one when one of them is closed', async () => {
    const store = await load()
    store.getState().setSideBySide(true)
    store.getState().closeType('holding_registers')

    expect(session(store).openTypes).toEqual(['input_registers'])
    expect(session(store).shownType).toBe('input_registers')
  })

  it('keep the one acted on when side by side is turned off', async () => {
    const store = await load()
    store.getState().setSideBySide(true)
    store.getState().focusType('input_registers')
    store.getState().setSideBySide(false)

    expect(session(store).openTypes).toEqual(['input_registers'])
  })
})

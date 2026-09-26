// @vitest-environment happy-dom
//
// A unit shows the register types its layout names, and the type buttons turn
// them on and off. One of the types shown is the type the view acts on.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from './stubRenderer'
import { selectedSession, selectedUnit } from '../client.zustand.helpers'

type Store = Awaited<ReturnType<typeof load>>

const load = async (): Promise<typeof import('../client.zustand').useClientZustand> =>
  (await import('../client.zustand')).useClientZustand

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

const layout = (store: Store): string => selectedUnit(store.getState()).layout
const shown = (store: Store): string => selectedSession(store.getState()).shownType

describe('turning a type on', () => {
  it('puts it below the type shown, and acts on it', async () => {
    const store = await load()
    store.getState().setType('coils')

    expect(layout(store)).toBe('c(hr:50,co:50)')
    expect(shown(store)).toBe('coils')
  })

  it('gives every type an equal share of the column', async () => {
    const store = await load()
    store.getState().setType('coils')
    store.getState().setType('input_registers')

    expect(layout(store)).toBe('c(hr:33.3,co:33.3,ir:33.3)')
  })
})

describe('turning a type off', () => {
  it('takes it out, and acts on a type still shown', async () => {
    const store = await load()
    store.getState().setType('coils')
    store.getState().setType('coils')

    expect(layout(store)).toBe('hr')
    expect(shown(store)).toBe('holding_registers')
  })

  it('keeps the last type on', async () => {
    const store = await load()
    store.getState().setType('holding_registers')

    expect(layout(store)).toBe('hr')
  })
})

describe('the layout of each unit', () => {
  it('is its own: another unit keeps the one it had', async () => {
    const store = await load()
    const first = selectedUnit(store.getState()).uuid
    await store.getState().addUnit()
    store.getState().setType('coils')

    store.getState().selectUnit(first)

    expect(layout(store)).toBe('hr')
    expect(shown(store)).toBe('holding_registers')
  })

  it('takes a dragged or resized layout, and refuses a string that names none', async () => {
    const store = await load()
    store.getState().setLayout('c(hr:30,ir:70)')
    store.getState().setLayout('not a layout')

    expect(layout(store)).toBe('c(hr:30,ir:70)')
  })
})

describe('acting on a type', () => {
  it('follows a press into a section the layout shows, and no other', async () => {
    const store = await load()
    store.getState().setType('coils')
    store.getState().focusType('holding_registers')
    store.getState().focusType('discrete_inputs')

    expect(shown(store)).toBe('holding_registers')
  })
})

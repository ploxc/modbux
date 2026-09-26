// @vitest-environment happy-dom
//
// Adding, removing and naming a unit each change the units main reads from,
// so each goes to main as the whole list, and what main was sent is what the
// store holds after.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientUnit } from '@shared'
import { recordApiCalls, stubRenderer, type ApiCall, clientPayload } from './stubRenderer'
import { selectedClient, selectedUnit } from '../client.zustand.helpers'

const load = async (): Promise<{
  useClientZustand: typeof import('../client.zustand').useClientZustand
}> => ({ useClientZustand: (await import('../client.zustand')).useClientZustand })

let calls: ApiCall[]

beforeEach(() => {
  vi.resetModules()
  vi.useRealTimers()
  localStorage.clear()
  stubRenderer()
  calls = []
})

/** The units the last `set_units` carried. */
const sentUnits = (): ClientUnit[] => {
  const call = calls.filter(({ method }) => method === 'setUnits').at(-1)
  return (call ? clientPayload(call.payload) : []) as ClientUnit[]
}

describe('adding a unit', () => {
  it('takes the unit id after the highest, hands main both, and shows it', async () => {
    const { useClientZustand } = await load()
    recordApiCalls(calls)

    expect(await useClientZustand.getState().addUnit()).toBe(true)

    const state = useClientZustand.getState()
    expect(sentUnits().map(({ unitId }) => unitId)).toEqual([1, 2])
    expect(selectedClient(state).units.map(({ unitId }) => unitId)).toEqual([1, 2])
    expect(selectedUnit(state).unitId).toBe(2)
  })
})

describe('removing a unit', () => {
  it('hands main the rest, and shows the first one left', async () => {
    const { useClientZustand } = await load()
    await useClientZustand.getState().addUnit()
    recordApiCalls(calls)
    const added = selectedUnit(useClientZustand.getState()).uuid

    expect(await useClientZustand.getState().removeUnit(added)).toBe(true)

    const state = useClientZustand.getState()
    expect(sentUnits().map(({ unitId }) => unitId)).toEqual([1])
    expect(selectedUnit(state).unitId).toBe(1)
  })

  it('keeps the last one', async () => {
    const { useClientZustand } = await load()
    recordApiCalls(calls)
    const only = selectedUnit(useClientZustand.getState()).uuid

    expect(await useClientZustand.getState().removeUnit(only)).toBe(false)
    expect(calls.filter(({ method }) => method === 'setUnits')).toEqual([])
    expect(selectedClient(useClientZustand.getState()).units).toHaveLength(1)
  })
})

describe('naming a unit', () => {
  it('writes the name at once and sends it with the units', async () => {
    const { useClientZustand } = await load()
    recordApiCalls(calls)

    useClientZustand.getState().setUnitName('Inverter')

    expect(selectedUnit(useClientZustand.getState()).name).toBe('Inverter')
    await vi.waitFor(() => expect(sentUnits()[0]?.name).toBe('Inverter'))
  })
})

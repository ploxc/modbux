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

  it('takes the unit id and name it is given', async () => {
    const { useClientZustand } = await load()
    recordApiCalls(calls)

    expect(await useClientZustand.getState().addUnit(7, 'PT100 module')).toBe(true)

    expect(sentUnits().map(({ unitId, name }) => [unitId, name])).toEqual([
      [1, ''],
      [7, 'PT100 module']
    ])
    expect(selectedUnit(useClientZustand.getState()).name).toBe('PT100 module')
  })
})

describe('duplicating a unit', () => {
  it('copies its mapping and layout under a new uuid and the next unit id, and shows it', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().setUnitName('Meter')
    useClientZustand.getState().setLayout('r(hr:50,co:50)')
    const source = selectedUnit(useClientZustand.getState())
    recordApiCalls(calls)

    expect(await useClientZustand.getState().duplicateUnit(source.uuid)).toBe(true)

    const copy = selectedUnit(useClientZustand.getState())
    expect(copy.uuid).not.toBe(source.uuid)
    expect([copy.unitId, copy.name, copy.layout]).toEqual([2, 'Meter copy', 'r(hr:50,co:50)'])
    expect(copy.registerMapping).toEqual(source.registerMapping)
    expect(sentUnits().map(({ unitId }) => unitId)).toEqual([1, 2])
  })

  it('refuses a unit the client does not hold', async () => {
    const { useClientZustand } = await load()
    recordApiCalls(calls)

    expect(await useClientZustand.getState().duplicateUnit('nobody')).toBe(false)
    expect(calls.filter(({ method }) => method === 'setUnits')).toEqual([])
  })
})

describe('moving a unit', () => {
  it('hands main the new order and holds it', async () => {
    const { useClientZustand } = await load()
    await useClientZustand.getState().addUnit(2)
    await useClientZustand.getState().addUnit(3)
    const { selectedUuid } = useClientZustand.getState()
    const third = selectedUnit(useClientZustand.getState()).uuid
    recordApiCalls(calls)

    expect(await useClientZustand.getState().moveUnit(selectedUuid, third, 0)).toBe(true)

    expect(sentUnits().map(({ unitId }) => unitId)).toEqual([3, 1, 2])
    expect(selectedClient(useClientZustand.getState()).units.map(({ unitId }) => unitId)).toEqual([
      3, 1, 2
    ])
  })

  it('refuses a unit the client does not hold', async () => {
    const { useClientZustand } = await load()
    await useClientZustand.getState().addUnit(2)
    const { selectedUuid } = useClientZustand.getState()
    recordApiCalls(calls)

    expect(await useClientZustand.getState().moveUnit(selectedUuid, 'nobody', 0)).toBe(false)
    expect(calls.filter(({ method }) => method === 'setUnits')).toEqual([])
  })

  it('refuses a client it does not hold', async () => {
    const { useClientZustand } = await load()
    recordApiCalls(calls)

    expect(await useClientZustand.getState().moveUnit('nobody', 'unit', 0)).toBe(false)
    expect(calls.filter(({ method }) => method === 'setUnits')).toEqual([])
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

// Monitor's group head switches Poll for its own unit, which need not be the
// one Debug has selected.
describe('polling a register type of a unit', () => {
  it('changes the unit it names and leaves the selected one alone', async () => {
    const { useClientZustand } = await load()
    const first = selectedUnit(useClientZustand.getState())
    await useClientZustand.getState().addUnit()
    const second = selectedUnit(useClientZustand.getState())
    useClientZustand.getState().selectUnit(first.uuid)
    const before = second.sections.coils.polled
    recordApiCalls(calls)

    expect(await useClientZustand.getState().setPolled('coils', !before, second.uuid)).toBe(true)

    const units = selectedClient(useClientZustand.getState()).units
    expect(units.map((unit) => unit.sections.coils.polled)).toEqual([
      first.sections.coils.polled,
      !before
    ])
    expect(sentUnits().map((unit) => unit.sections.coils.polled)).toEqual([
      first.sections.coils.polled,
      !before
    ])
    expect(selectedUnit(useClientZustand.getState()).uuid).toBe(first.uuid)
  })

  it('refuses a unit the client does not hold', async () => {
    const { useClientZustand } = await load()
    recordApiCalls(calls)

    expect(await useClientZustand.getState().setPolled('coils', true, 'no-such-unit')).toBe(false)
    expect(sentUnits()).toEqual([])
  })
})

// @vitest-environment happy-dom
//
// A trend is saved with its client under a name. Saving under a name that
// holds one replaces it, a rename refuses a name another trend holds, and a
// duplicated client's trends name its own units rather than the source's.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_CLIENT_UUID, SavedTrend } from '@shared'
import { stubRenderer } from './stubRenderer'

const load = async (): Promise<typeof import('../client.zustand').useClientZustand> =>
  (await import('../client.zustand')).useClientZustand

const trend = (name: string, unit: string, address = 0): SavedTrend => ({
  name,
  entries: [{ unit, type: 'holding_registers', address, color: '#81bc57' }],
  range: '10m',
  settings: { time: 'clock', drawAs: 'lines' }
})

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('the trends saved with a client', () => {
  it('keeps a trend under its name, and replaces the one of that name', async () => {
    const useClientZustand = await load()
    const store = useClientZustand.getState()
    store.saveTrend(MAIN_CLIENT_UUID, trend('Currents', 'unit-1', 0))
    store.saveTrend(MAIN_CLIENT_UUID, trend('Pump', 'unit-1', 1))
    store.saveTrend(MAIN_CLIENT_UUID, trend('Currents', 'unit-1', 5))

    const saved = useClientZustand.getState().clients[MAIN_CLIENT_UUID]?.trends
    expect(saved?.map(({ name, entries }) => [name, entries[0]?.address])).toEqual([
      ['Pump', 1],
      ['Currents', 5]
    ])
  })

  it('renames a trend, and refuses the name another trend holds', async () => {
    const useClientZustand = await load()
    const store = useClientZustand.getState()
    store.saveTrend(MAIN_CLIENT_UUID, trend('Currents', 'unit-1'))
    store.saveTrend(MAIN_CLIENT_UUID, trend('Pump', 'unit-1'))

    expect(store.renameTrend(MAIN_CLIENT_UUID, 'Currents', 'Pump')).toBe(false)
    expect(store.renameTrend(MAIN_CLIENT_UUID, 'Currents', 'Phases')).toBe(true)
    const names = useClientZustand
      .getState()
      .clients[MAIN_CLIENT_UUID]?.trends?.map(({ name }) => name)
    expect(names).toEqual(['Phases', 'Pump'])
  })

  it('deletes a trend by name', async () => {
    const useClientZustand = await load()
    const store = useClientZustand.getState()
    store.saveTrend(MAIN_CLIENT_UUID, trend('Currents', 'unit-1'))
    store.deleteTrend(MAIN_CLIENT_UUID, 'Currents')

    expect(useClientZustand.getState().clients[MAIN_CLIENT_UUID]?.trends).toEqual([])
  })

  it("names the copy's own units in a duplicated client's trends", async () => {
    const useClientZustand = await load()
    const store = useClientZustand.getState()
    const unit = store.clients[MAIN_CLIENT_UUID]?.units[0]?.uuid ?? ''
    store.saveTrend(MAIN_CLIENT_UUID, trend('Currents', unit))
    const copy = store.duplicateClient(MAIN_CLIENT_UUID) ?? ''

    const client = useClientZustand.getState().clients[copy]
    const copiedUnit = client?.units[0]?.uuid
    expect(copiedUnit).not.toBe(unit)
    expect(client?.trends?.[0]?.entries[0]?.unit).toBe(copiedUnit)
  })
})

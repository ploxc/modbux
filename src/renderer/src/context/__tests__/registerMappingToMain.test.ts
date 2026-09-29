// @vitest-environment happy-dom
//
// Main reads the register mapping only while read configuration is on, and it
// reads the copy the renderer last sent it. `setRegisterMapping` sent one per
// edit; replacing or clearing the whole mapping sent nothing, so main kept
// grouping its reads out of the mapping the renderer had thrown away.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientUnit, RegisterMapping } from '@shared'
import { ApiCall, recordApiCalls, stubRenderer, clientPayload } from './stubRenderer'
import { readsConfiguration, selectedUnit } from '../client.zustand.helpers'

const calls: ApiCall[] = []

const methods = (): string[] => calls.map((call) => call.method)

/** What main was last handed, or a failure naming the channel that never fired. */
const lastPayload = (method: string): unknown => {
  const call = calls.findLast((candidate) => candidate.method === method)
  if (!call) throw new Error(`${method} was never called`)
  return clientPayload(call.payload)
}

/** The mapping of the one unit main was last handed. */
const sentMapping = (): RegisterMapping | undefined =>
  (lastPayload('setUnits') as ClientUnit[])[0]?.registerMapping

/** What the last `setReadConfiguration` asked main to hold. */
const sentReadConfiguration = (): unknown => {
  const call = calls.findLast((candidate) => candidate.method === 'setReadConfiguration')
  if (!call) throw new Error('setReadConfiguration was never called')
  return (call.payload as { readConfiguration: unknown }).readConfiguration
}

/**
 * The store, with the calls `init` makes at import time already dropped.
 *
 * `init` turns read configuration off and asks main for the client state, and
 * every test here reads the calls a later action makes.
 */
const loadStore = async (): Promise<typeof import('../client.zustand')> => {
  const store = await import('../client.zustand')
  calls.length = 0
  return store
}

const loaded: RegisterMapping = {
  coils: { 7: { dataType: 'int16' } },
  discrete_inputs: {},
  holding_registers: { 65535: { dataType: 'uint16', comment: 'the last one' } },
  input_registers: {}
}

beforeEach(() => {
  vi.resetModules()
  vi.useRealTimers()
  localStorage.clear()
  calls.length = 0
  stubRenderer()
  recordApiCalls(calls)
})

describe('a mapping that replaces the whole of the previous one', () => {
  it('reaches main, types the current one included and not', async () => {
    const { useClientZustand } = await loadStore()

    await useClientZustand.getState().replaceRegisterMapping(loaded)

    expect(sentMapping()).toEqual(loaded)
  })

  it('reaches main before the debounce a cell edit is on', async () => {
    vi.useFakeTimers()
    const { useClientZustand } = await loadStore()

    await useClientZustand.getState().replaceRegisterMapping(loaded)

    expect(methods()).toContain('setUnits')
  })

  it('turns read configuration off first, so no read answers out of the old one', async () => {
    const { useClientZustand } = await loadStore()
    useClientZustand.getState().setReadConfiguration(true)
    calls.length = 0

    await useClientZustand.getState().replaceRegisterMapping(loaded)

    expect(methods()).toEqual(['setReadConfiguration', 'setUnits'])
    expect(sentReadConfiguration()).toBe(false)
    expect(readsConfiguration(useClientZustand.getState())).toBe(false)
  })

  it('is what the store holds', async () => {
    const { useClientZustand } = await loadStore()

    await useClientZustand.getState().replaceRegisterMapping(loaded)

    expect(selectedUnit(useClientZustand.getState()).registerMapping).toEqual(loaded)
  })
})

describe('a cleared mapping', () => {
  it('reaches main empty, for all four types', async () => {
    const { useClientZustand } = await loadStore()
    await useClientZustand.getState().replaceRegisterMapping(loaded)
    calls.length = 0

    await useClientZustand.getState().clearRegisterMapping()

    expect(sentMapping()).toEqual({
      coils: {},
      discrete_inputs: {},
      holding_registers: {},
      input_registers: {}
    })
  })

  it('turns read configuration off first', async () => {
    const { useClientZustand } = await loadStore()
    await useClientZustand.getState().replaceRegisterMapping(loaded)
    useClientZustand.getState().setReadConfiguration(true)
    calls.length = 0

    await useClientZustand.getState().clearRegisterMapping()

    expect(methods()).toEqual(['setReadConfiguration', 'setUnits'])
    expect(readsConfiguration(useClientZustand.getState())).toBe(false)
  })

  it('leaves the store holding four empty records', async () => {
    const { useClientZustand } = await loadStore()
    await useClientZustand.getState().replaceRegisterMapping(loaded)

    await useClientZustand.getState().clearRegisterMapping()

    expect(selectedUnit(useClientZustand.getState()).registerMapping).toEqual({
      coils: {},
      discrete_inputs: {},
      holding_registers: {},
      input_registers: {}
    })
  })
})

describe('a single cell edit', () => {
  it('still reaches main, and waits the debounce out first', async () => {
    vi.useFakeTimers()
    const { useClientZustand } = await loadStore()

    useClientZustand.getState().setRegisterMapping('holding_registers', 42, 'dataType', 'int16')

    expect(methods()).not.toContain('setUnits')

    vi.advanceTimersByTime(150)

    expect(sentMapping()).toEqual({
      coils: {},
      discrete_inputs: {},
      holding_registers: { 42: { dataType: 'int16' } },
      input_registers: {}
    })
  })

  it('leaves read configuration where the user put it', async () => {
    vi.useFakeTimers()
    const { useClientZustand } = await loadStore()
    useClientZustand.getState().setRegisterMapping('holding_registers', 42, 'dataType', 'int16')
    useClientZustand.getState().setReadConfiguration(true)

    useClientZustand.getState().setRegisterMapping('holding_registers', 43, 'dataType', 'int16')
    vi.advanceTimersByTime(150)

    expect(readsConfiguration(useClientZustand.getState())).toBe(true)
  })
})

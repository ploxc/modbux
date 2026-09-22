// @vitest-environment happy-dom
//
// A reader that derives its next value from this one cannot wait for the 50 ms
// batcher: the word it writes back would drop everything written since. The bit
// panel is that reader.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { MAIN_SERVER_UUID, ServerRegister, ServerRegisters } from '@shared'
import { stubRenderer } from './stubRenderer'

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  localStorage.clear()
  stubRenderer()
})

afterEach(() => {
  vi.useRealTimers()
})

/** One bitmap register, as the add dialog would have built it. */
const entry = (address: number, value: number): ServerRegister[string] => ({
  value,
  params: {
    address,
    registerType: 'holding_registers',
    dataType: 'bitmap',
    comment: '',
    value,
    min: undefined,
    max: undefined,
    interval: undefined
  }
})

/** The store with one bitmap register at address 10, on the default unit. */
const seeded = async (): Promise<typeof import('../server.zustand')> => {
  const store = await import('../server.zustand')
  store.useServerZustand.getState().clean(MAIN_SERVER_UUID)
  store.useServerZustand.getState().replaceServerRegisters('0', {
    coils: {},
    discrete_inputs: {},
    input_registers: {},
    holding_registers: { 10: entry(10, 1) }
  })
  return store
}

/** The entry the store holds, or a failure saying it is not there. */
const stored = (store: typeof import('../server.zustand')): ServerRegister[string] => {
  const registers: ServerRegisters | undefined =
    store.useServerZustand.getState().servers[MAIN_SERVER_UUID]?.registers['0']
  const found = registers?.holding_registers[10]
  if (!found) throw new Error('the register at address 10 is not there')
  return found
}

describe('pendingRegisterValue', () => {
  it('answers the entry when the batcher holds nothing', async () => {
    const store = await seeded()

    expect(store.pendingRegisterValue(MAIN_SERVER_UUID, '0', stored(store))).toBe(1)
  })

  it('answers the word a write left in the batcher, before the entry has it', async () => {
    const store = await seeded()

    store.applyRegisterValue({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      registerType: 'holding_registers',
      address: 10,
      value: 3
    })

    expect(stored(store).value).toBe(1)
    expect(store.pendingRegisterValue(MAIN_SERVER_UUID, '0', stored(store))).toBe(3)
  })

  it('answers the entry again once the batcher has flushed', async () => {
    const store = await seeded()

    store.applyRegisterValue({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      registerType: 'holding_registers',
      address: 10,
      value: 3
    })
    await vi.advanceTimersByTimeAsync(100)

    expect(stored(store).value).toBe(3)
    expect(store.pendingRegisterValue(MAIN_SERVER_UUID, '0', stored(store))).toBe(3)
  })
})

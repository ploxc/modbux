// @vitest-environment happy-dom
//
// `ServerRegisterEntrySchema.value` was `z.number()`. `applyRegisterValue` read
// the composite back with `getBigUint64` and stored `Number(...)`, so four
// words of 0xFFFF came out 18446744073709552000 rather than
// 18446744073709551615. The next single word write read that back through
// `BigInt`, which `setBigUint64` takes modulo 2 ** 64 rather than throwing, so
// the entry collapsed to the low word alone. `ServerRegisters.tsx` renders
// `register.value`, and the four `register_value` senders in main send one
// event per word, so a client writing a 64-bit holding register reaches it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAIN_SERVER_UUID,
  ServerRegisterEntry,
  ServerRegisterValue,
  ServerRegisters
} from '@shared'
import { stubRenderer } from './stubRenderer'

type Store = typeof import('../server.zustand')

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  localStorage.clear()
  stubRenderer()
})
afterEach(() => vi.useRealTimers())

/** One 64 bit register at address 10, holding `value`. */
const entry = (dataType: 'uint64' | 'int64', value: ServerRegisterValue): ServerRegisterEntry => ({
  value,
  params: {
    address: 10,
    registerType: 'holding_registers' as const,
    dataType,
    comment: '',
    value: 0,
    min: undefined,
    max: undefined,
    interval: undefined
  }
})

const seeded = async (dataType: 'uint64' | 'int64'): Promise<Store> => {
  const store = await import('../server.zustand')
  store.useServerZustand.getState().clean(MAIN_SERVER_UUID)
  store.useServerZustand.getState().replaceServerRegisters('0', {
    coils: {},
    discrete_inputs: {},
    input_registers: {},
    holding_registers: { 10: entry(dataType, 0) }
  })
  return store
}

const stored = (store: Store): ServerRegisterValue => {
  const registers: ServerRegisters | undefined =
    store.useServerZustand.getState().serverRegisters[MAIN_SERVER_UUID]?.['0']
  const found = registers?.holding_registers[10]
  if (!found) throw new Error('the register at address 10 is not there')
  return found.value
}

const write = (store: Store, offset: number, word: number): void =>
  store.applyRegisterValue({
    uuid: MAIN_SERVER_UUID,
    unitId: '0',
    registerType: 'holding_registers',
    address: 10 + offset,
    value: word
  })

describe('a uint64 register a client writes', () => {
  it('holds every one of its 64 bits', async () => {
    const store = await seeded('uint64')
    for (const [offset, word] of [0xffff, 0xffff, 0xffff, 0xffff].entries()) {
      write(store, offset, word)
    }
    await vi.advanceTimersByTimeAsync(100)

    expect(stored(store)).toBe('18446744073709551615')
  })

  // The flush clears the batcher, so the next word write reads the entry, and
  // what it finds there has to be the exact digits rather than the rounded
  // number.
  it('keeps the other three words when one more word is written after a flush', async () => {
    const store = await seeded('uint64')
    for (const [offset, word] of [0xffff, 0xffff, 0xffff, 0xffff].entries()) {
      write(store, offset, word)
    }
    await vi.advanceTimersByTimeAsync(100)

    write(store, 3, 0x0001)
    await vi.advanceTimersByTimeAsync(100)

    expect(stored(store)).toBe('18446744073709486081')
  })

  it('holds a value above 2 ** 53 exactly', async () => {
    const store = await seeded('uint64')
    for (const [offset, word] of [0x0102, 0x0304, 0x0506, 0x0708].entries()) {
      write(store, offset, word)
    }
    await vi.advanceTimersByTimeAsync(100)

    expect(stored(store)).toBe('72623859790382856')
  })
})

describe('an int64 register a client writes', () => {
  it('holds minus one', async () => {
    const store = await seeded('int64')
    for (const [offset, word] of [0xffff, 0xffff, 0xffff, 0xffff].entries()) {
      write(store, offset, word)
    }
    await vi.advanceTimersByTimeAsync(100)

    expect(stored(store)).toBe('-1')
  })
})

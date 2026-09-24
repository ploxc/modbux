// @vitest-environment happy-dom
//
// `setLittleEndian` leaves rows that were decoded in the other word order, and
// puts that right by asking main to read. Main refuses a read while a poll,
// either scan or a read already in flight owns the port, and again while
// nothing is connected, and says so in a snackbar, so the setter may not ask in
// those states. `setReadConfiguration` asks for no read at all.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, emptyRegisterMapping, MAIN_CLIENT_UUID } from '@shared'
import type { ClientState, RegisterData } from '@shared'
import { ApiCall, recordApiCalls, stubRenderer } from './stubRenderer'
import { shownData } from './shownData'

const calls: ApiCall[] = []

const methods = (): string[] => calls.map((call) => call.method)

const idle: ClientState = { ...defaultClientState, connectState: 'connected' }

const row: RegisterData = {
  id: 0,
  buffer: new Uint8Array([0, 0]),
  hex: '0000',
  words: undefined,
  bit: false,
  isScanned: false
}

/**
 * The stores, with the calls `init` makes at import time already dropped.
 *
 * `init` pushes both configs, turns read configuration off and asks main for
 * the client state. Every test here reads the calls one later action makes.
 */
const load = async (): Promise<{
  useClientZustand: typeof import('../client.zustand').useClientZustand
  useDataZustand: typeof import('../data.zustand').useDataZustand
}> => {
  const { useClientZustand } = await import('../client.zustand')
  const { useDataZustand } = await import('../data.zustand')
  calls.length = 0
  return { useClientZustand, useDataZustand }
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  calls.length = 0
  stubRenderer()
  recordApiCalls(calls)
})

// Turning read configuration on draws the mapping and reads nothing: a read
// fired by the switch could land after the switch went back, and a read of the
// toolbar's range then filled a grid that was drawing the mapping. The next
// Read or poll brings the values.
describe('read configuration, turned on or off', () => {
  it('asks main for no read when on, connected and idle', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(true)

    expect(methods()).toEqual(['setReadConfiguration'])
  })

  it('tells main the flag when off', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    useClientZustand.getState().setReadConfiguration(true)
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(false)

    expect(methods()).toEqual(['setReadConfiguration'])
  })
})

describe('the byte order, which reads through the same rule', () => {
  it('asks for a read when rows are on screen', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig', 'read'])
  })

  // Main refuses a read of no registers, and after a restart it holds the 0
  // the Length field kept.
  it('asks for nothing while the Length field holds a length it refused', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [row])
    await useClientZustand.getState().setLength('0', false)
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing on an empty grid', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing disconnected', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand
      .getState()
      .setClientState(MAIN_CLIENT_UUID, { ...idle, connectState: 'disconnected' })
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing while polling', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, { ...idle, polling: true })
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing while a register scan runs', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, { ...idle, scanningRegisters: true })
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing while a unit id scan runs', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, { ...idle, scanningUnitIds: true })
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing while a read is in flight', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, { ...idle, reading: true })
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing while a write is in flight', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, { ...idle, writing: true })
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })
})

/**
 * The unit id and the register type, which change what the grid is about.
 *
 * `clearRegisterDataWhenIdle` emptied the grid for both, and returned early
 * with read configuration on because the grid is drawn from the mapping there.
 * So the old unit's values stayed in the named rows under the new unit id, and
 * a type change left the rows of the type before it: `RegisterGrid` redraws
 * the mapping on a change of `readConfiguration` and not of `type`.
 */
describe('read configuration on, and the question the grid answers changes', () => {
  /**
   * The mapping with a holding register, an input register and a coil.
   *
   * The coil carries a data type, which no press can put there: the grid
   * mounts that column for the two number types alone. A config file can, and
   * that is the entry `_read` ignores while `showMapping` draws it.
   */
  const withMapping = async (
    useClientZustand: typeof import('../client.zustand').useClientZustand
  ): Promise<void> => {
    const mapping = emptyRegisterMapping()
    mapping.holding_registers['0'] = { dataType: 'uint16', comment: 'holding' }
    mapping.input_registers['9'] = { dataType: 'uint16', comment: 'input' }
    mapping.coils['4'] = { dataType: 'uint16', comment: 'coil' }
    await useClientZustand.getState().replaceRegisterMapping(mapping)
    useClientZustand.getState().setReadConfiguration(true)
  }

  it('a new unit id redraws the mapping and asks main to read it', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    await withMapping(useClientZustand)
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setUnitId('3')

    expect(methods()).toEqual(['updateConnectionConfig', 'read'])
    expect(shownData(useDataZustand).registerData.map((data) => data.hex)).toEqual(['0000'])
  })

  it('a new register type draws that type and asks main to read it', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    await withMapping(useClientZustand)
    calls.length = 0

    await useClientZustand.getState().setType('input_registers')

    expect(methods()).toEqual(['updateRegisterConfig', 'read'])
    expect(shownData(useDataZustand).registerData.map((data) => data.id)).toEqual([9])
  })

  /**
   * A bit type, where main reads the toolbar's block rather than the mapping.
   *
   * `_read` groups by data type for the two number types alone, so a read
   * asked for here comes back as `length` coils from `address` and replaces
   * the rows `showMapping` just drew. Both fields hold whatever was in them
   * when read configuration went on, because both are disabled under it.
   */
  it('a bit type draws the mapping and asks for nothing', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    await withMapping(useClientZustand)
    calls.length = 0

    await useClientZustand.getState().setType('coils')

    expect(methods()).toEqual(['updateRegisterConfig'])
    expect(shownData(useDataZustand).registerData.map((data) => data.id)).toEqual([4])
  })

  // The same fallback, reached the other way: a groupable type the mapping
  // configures nothing for. `RegisterConfig`'s `nothingConfigured` effect turns
  // read configuration off a render later and the grid clears, so a read asked
  // for here is answered into a grid that is about to go.
  it('a type the mapping configures nothing for asks for nothing', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    const mapping = emptyRegisterMapping()
    mapping.holding_registers['0'] = { dataType: 'uint16', comment: 'holding' }
    await useClientZustand.getState().replaceRegisterMapping(mapping)
    useClientZustand.getState().setReadConfiguration(true)
    calls.length = 0

    await useClientZustand.getState().setType('input_registers')

    expect(methods()).toEqual(['updateRegisterConfig'])
    expect(shownData(useDataZustand).registerData).toEqual([])
  })

  // The refusal rule is the same one, so a state main would refuse costs the
  // ask and not the redraw: the rows on screen are the old unit's either way.
  it('a new unit id while a poll runs leaves the grid to the poll', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    await withMapping(useClientZustand)
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, { ...idle, polling: true })
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setUnitId('3')

    expect(methods()).toEqual(['updateConnectionConfig'])
    expect(shownData(useDataZustand).registerData.map((data) => data.hex)).toEqual(['BEEF'])
  })

  it('a new unit id while a write is in flight redraws and asks for nothing', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    await withMapping(useClientZustand)
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, { ...idle, writing: true })
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setUnitId('3')

    expect(methods()).toEqual(['updateConnectionConfig'])
    expect(shownData(useDataZustand).registerData.map((data) => data.hex)).toEqual(['0000'])
  })

  /**
   * The address and the length are not that question.
   *
   * `_read` builds its groups from the mapping and falls back to the toolbar's
   * group only when the mapping has none, so with read configuration on those
   * two change nothing about what is read. Redrawing would trade the values a
   * device answered for `showMapping`'s zeros, and on a disconnected client
   * `readWhenMainCan` asks for nothing to put back.
   */
  it('a new address leaves the rows and asks for nothing', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    await withMapping(useClientZustand)
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setAddress('7')

    expect(methods()).toEqual(['updateRegisterConfig'])
    expect(shownData(useDataZustand).registerData.map((data) => data.hex)).toEqual(['BEEF'])
  })

  it('a new length leaves the rows and asks for nothing', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    await withMapping(useClientZustand)
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setLength('7', true)

    expect(methods()).toEqual(['updateRegisterConfig'])
    expect(shownData(useDataZustand).registerData.map((data) => data.hex)).toEqual(['BEEF'])
  })

  // With read configuration off the grid still empties, which is what the two
  // setters did before and what the address and length fields rely on.
  it('a new unit id with read configuration off empties the grid', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useDataZustand.getState().setClientState(MAIN_CLIENT_UUID, idle)
    useDataZustand.getState().setRegisterData(MAIN_CLIENT_UUID, [row])
    calls.length = 0

    await useClientZustand.getState().setUnitId('3')

    expect(methods()).toEqual(['updateConnectionConfig'])
    expect(shownData(useDataZustand).registerData).toEqual([])
  })
})

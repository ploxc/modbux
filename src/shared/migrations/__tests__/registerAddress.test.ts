import { describe, expect, it } from 'vitest'
import {
  AddRegisterParamsSchema,
  RemoveRegisterParamsSchema,
  ServerConfigSchema,
  SyncRegisterValueParamsSchema
} from '../../types/server'
import { CURRENT_SERVER_ZUSTAND_VERSION } from '../server/zustand'
import { dropUnservableRegisters } from '../shared'

/** The last store version whose blobs can carry a register outside the map. */
const LAST_VERSION_ACCEPTING_ANY_ADDRESS = 4

/** A register the add, sync and config paths all take, at `address`. */
const params = (address: number): Record<string, unknown> => ({
  address,
  registerType: 'holding_registers',
  dataType: 'uint16',
  comment: '',
  value: 1
})

const addAccepts = (address: number): boolean =>
  AddRegisterParamsSchema.safeParse({
    uuid: 'u',
    unitId: '1',
    littleEndian: false,
    params: params(address)
  }).success

const removeAccepts = (address: number): boolean =>
  RemoveRegisterParamsSchema.safeParse({
    uuid: 'u',
    unitId: '1',
    registerType: 'holding_registers',
    address,
    dataType: 'uint16'
  }).success

const syncAccepts = (address: number): boolean =>
  SyncRegisterValueParamsSchema.safeParse({
    uuid: 'u',
    unitId: '1',
    littleEndian: false,
    registerValues: [params(address)]
  }).success

const configAccepts = (address: number): boolean =>
  ServerConfigSchema.safeParse({
    version: 2,
    modbuxVersion: '2.3.0',
    name: 'bench',
    littleEndian: false,
    serverRegistersPerUnit: {
      '1': {
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: { [String(address)]: { value: 1, params: params(address) } }
      }
    }
  }).success

/** A persisted blob with one register per address given, on one server. */
const persistedWith = (addresses: number[]): Record<string, unknown> => ({
  serverRegisters: {
    u: {
      '1': {
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: Object.fromEntries(
          addresses.map((address) => [String(address), { value: 1, params: params(address) }])
        )
      }
    }
  }
})

/** The holding registers of a migrated blob, or a failure naming what is missing. */
const migratedHoldingRegisters = (state: Record<string, unknown>): Record<string, unknown> => {
  const perUuid = state.serverRegisters as Record<string, unknown> | undefined
  const perUnit = perUuid?.u as Record<string, unknown> | undefined
  const registers = perUnit?.['1'] as Record<string, unknown> | undefined
  const holding = registers?.holding_registers as Record<string, unknown> | undefined
  if (!holding) throw new Error('the migrated blob has no serverRegisters.u.1.holding_registers')
  return holding
}

describe('the address every server path names', () => {
  // Add took a bare number and remove took the range, so a register went in at
  // 70000 and could not come back out. The four have to answer alike.
  it.each([-1, 1.5, 70000])('refuses %p on add, remove, sync and a config file', (address) => {
    expect(addAccepts(address)).toBe(false)
    expect(removeAccepts(address)).toBe(false)
    expect(syncAccepts(address)).toBe(false)
    expect(configAccepts(address)).toBe(false)
  })

  it.each([0, 65535])('accepts %p on add, remove, sync and a config file', (address) => {
    expect(addAccepts(address)).toBe(true)
    expect(removeAccepts(address)).toBe(true)
    expect(syncAccepts(address)).toBe(true)
    expect(configAccepts(address)).toBe(true)
  })

  // The map is keyed by address as well, and the two can disagree: the server
  // is driven from the parameters and the grid draws the key.
  it('refuses a register keyed outside the map whose parameters are inside it', () => {
    const config = {
      version: 2,
      modbuxVersion: '2.3.0',
      name: 'bench',
      littleEndian: false,
      serverRegistersPerUnit: {
        '1': {
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: { '70000': { value: 1, params: params(100) } }
        }
      }
    }
    expect(ServerConfigSchema.safeParse(config).success).toBe(false)
  })

  // A boolean type carries its address in the key alone, with no parameters
  // behind it to catch the same thing.
  it('refuses a coil keyed outside the map', () => {
    const config = {
      version: 2,
      modbuxVersion: '2.3.0',
      name: 'bench',
      littleEndian: false,
      serverRegistersPerUnit: {
        '1': {
          coils: { '70000': { value: true } },
          discrete_inputs: {},
          input_registers: {},
          holding_registers: {}
        }
      }
    }
    expect(ServerConfigSchema.safeParse(config).success).toBe(false)
  })
})

describe('a persisted register outside the map', () => {
  it('goes, and the registers beside it stay', () => {
    const state = persistedWith([0, 100, 65535, 70000])
    dropUnservableRegisters(state)

    expect(Object.keys(migratedHoldingRegisters(state))).toEqual(['0', '100', '65535'])
  })

  it('goes when only its parameters carry the address', () => {
    const state = persistedWith([100])
    migratedHoldingRegisters(state)['100'] = { value: 1, params: params(70000) }
    dropUnservableRegisters(state)

    expect(Object.keys(migratedHoldingRegisters(state))).toEqual([])
  })

  it('is behind a version the store has moved past', () => {
    expect(CURRENT_SERVER_ZUSTAND_VERSION).toBeGreaterThan(LAST_VERSION_ACCEPTING_ANY_ADDRESS)
  })
})

describe('the drop on its own', () => {
  it('leaves a blob with no registers alone', () => {
    const state: Record<string, unknown> = { serverMode: 'rtu' }
    dropUnservableRegisters(state)

    expect(state).toEqual({ serverMode: 'rtu' })
  })

  // A hand-edited store is where a null in the middle of the walk comes from,
  // and reading a field off it throws rather than failing a schema.
  it('walks past a null where a server, a unit or a register type should be', () => {
    const state: Record<string, unknown> = {
      serverRegisters: { u: null, v: { '1': null }, w: { '1': { coils: null } } }
    }
    dropUnservableRegisters(state)

    expect(state).toEqual({
      serverRegisters: { u: null, v: { '1': null }, w: { '1': { coils: null } } }
    })
  })

  // A coil carries its address in the key alone, so the params check has to be
  // skipped rather than failed for it.
  it('keeps a coil that has no parameters', () => {
    const state: Record<string, unknown> = {
      serverRegisters: { u: { '1': { coils: { '3': { value: true }, '70000': { value: true } } } } }
    }
    dropUnservableRegisters(state)

    const perUuid = state.serverRegisters as Record<string, Record<string, unknown>>
    const unit = perUuid.u?.['1'] as Record<string, unknown>
    expect(Object.keys(unit.coils as Record<string, unknown>)).toEqual(['3'])
  })

  it('drops an entry that is not an object', () => {
    const state: Record<string, unknown> = {
      serverRegisters: { u: { '1': { coils: { '3': 'true' } } } }
    }
    dropUnservableRegisters(state)

    const perUuid = state.serverRegisters as Record<string, Record<string, unknown>>
    const unit = perUuid.u?.['1'] as Record<string, unknown>
    expect(Object.keys(unit.coils as Record<string, unknown>)).toEqual([])
  })
})

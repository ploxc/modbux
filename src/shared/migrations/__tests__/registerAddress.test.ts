import { describe, expect, it } from 'vitest'
import {
  AddRegisterParamsSchema,
  RemoveRegisterParamsSchema,
  ServerConfigSchema,
  SyncRegisterValueParamsSchema
} from '../../types/server'
import { CURRENT_SERVER_ZUSTAND_VERSION, migrateServerState } from '../server/zustand'
import { CURRENT_CLIENT_ZUSTAND_VERSION, migrateClientState } from '../client/zustand'
import { dropUnmappableRegisters, dropUnservableRegisters } from '../shared'

/**
 * What 2.3.0 wrote, and so the highest version a blob off this branch carries.
 * Every step below runs on it, because the steps between were collapsed into
 * one and never reached a release.
 */
const SHIPPED_SERVER_VERSION = 3

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
    expect(CURRENT_SERVER_ZUSTAND_VERSION).toBeGreaterThan(SHIPPED_SERVER_VERSION)
  })

  // The drop on its own is not the store's behaviour; the step in `migrate` is.
  it('is dropped by the migration a shipped blob runs', () => {
    const state = migrateServerState(persistedWith([100, 70000]), SHIPPED_SERVER_VERSION)

    expect(Object.keys(migratedHoldingRegisters(state))).toEqual(['100'])
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

    expect(state.serverRegisters).toEqual({
      u: null,
      v: { '1': null },
      w: { '1': { coils: null } }
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

/**
 * The key and `params.address` are one address written twice.
 *
 * `ServerRegisters` draws `params.address` and `syncRegistersWithBackend` sends
 * it; `setRegisterValue` and `removeRegister` look the entry up by key. A file
 * or a blob where the two disagree serves the register at one address and
 * answers the grid at the other.
 */
describe('a register whose key and parameters disagree', () => {
  /** The blob of `persistedWith`, with the entry at `key` naming `address`. */
  const persistedSaying = (key: string, address: number): Record<string, unknown> => {
    const state = persistedWith([])
    migratedHoldingRegisters(state)[key] = { value: 1, params: params(address) }
    return state
  }

  it('is refused by name in a config file', () => {
    const result = ServerConfigSchema.safeParse({
      version: 2,
      modbuxVersion: '2.3.0',
      name: 'bench',
      littleEndian: false,
      serverRegistersPerUnit: {
        '1': {
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: { '5': { value: 1, params: params(9) } }
        }
      }
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([
      'serverRegistersPerUnit',
      '1',
      'holding_registers',
      '5',
      'params',
      'address'
    ])
  })

  it('is taken by the config path when the two agree', () => {
    expect(configAccepts(9)).toBe(true)
  })

  it('goes from a persisted blob, and the registers beside it stay', () => {
    const state = persistedWith([100])
    migratedHoldingRegisters(state)['5'] = { value: 1, params: params(9) }
    dropUnservableRegisters(state)

    expect(Object.keys(migratedHoldingRegisters(state))).toEqual(['100'])
  })

  // `RegisterAddressKeySchema` takes a key of digits, and `String(7)` is not
  // `'007'`, so the lookups the store does find nothing under it.
  it('goes for a key that is the same number written differently', () => {
    const state = persistedSaying('007', 7)
    dropUnservableRegisters(state)

    expect(Object.keys(migratedHoldingRegisters(state))).toEqual([])
  })

  it('stays when the two say the same address', () => {
    const state = persistedSaying('7', 7)
    dropUnservableRegisters(state)

    expect(Object.keys(migratedHoldingRegisters(state))).toEqual(['7'])
  })
})

describe('a persisted generator the interval floor refuses', () => {
  /** A generated register firing every `interval` milliseconds, at address 10. */
  const generator = (interval: number): Record<string, unknown> => ({
    address: 10,
    registerType: 'holding_registers',
    dataType: 'uint16',
    comment: '',
    min: 0,
    max: 100,
    interval
  })

  const persistedGenerators = (intervals: number[]): Record<string, unknown> => ({
    serverRegisters: {
      u: {
        '1': {
          holding_registers: Object.fromEntries(
            intervals.map((interval, index) => [
              String(index),
              { value: 1, params: { ...generator(interval), address: index } }
            ])
          )
        }
      }
    }
  })

  const holdingRegisters = (state: Record<string, unknown>): Record<string, unknown> => {
    const perUuid = state.serverRegisters as Record<string, Record<string, unknown>>
    const unit = perUuid.u?.['1'] as Record<string, unknown>
    return unit.holding_registers as Record<string, unknown>
  }

  it('goes, and the generators beside it stay', () => {
    const state = persistedGenerators([1000, 0, 10000])
    dropUnservableRegisters(state)

    expect(Object.keys(holdingRegisters(state))).toEqual(['0', '2'])
  })

  // The Add button sends one, so the drop has to leave it where it is.
  it('stays when its min sits above its max', () => {
    const state = persistedGenerators([1000])
    holdingRegisters(state)['0'] = {
      value: 1,
      params: { ...generator(1000), address: 0, min: 10, max: 1 }
    }
    dropUnservableRegisters(state)

    expect(Object.keys(holdingRegisters(state))).toEqual(['0'])
  })

  it('is behind a version the store has moved past', () => {
    expect(CURRENT_SERVER_ZUSTAND_VERSION).toBeGreaterThan(SHIPPED_SERVER_VERSION)
  })
})

describe('the used addresses the drop writes back', () => {
  /** A generator at `address` firing every millisecond, which the floor refuses. */
  const refusedGenerator = (address: number): Record<string, unknown> => ({
    address,
    registerType: 'holding_registers',
    dataType: 'uint16',
    comment: '',
    min: 0,
    max: 10,
    interval: 1
  })

  /** A register at `address` occupying two addresses, which the drop keeps. */
  const wideRegister = (address: number): Record<string, unknown> => ({
    ...params(address),
    dataType: 'float'
  })

  const persisted = (): Record<string, unknown> => ({
    usedAddresses: {
      u: {
        '1': { input_registers: [], holding_registers: [100, 101, 200] },
        '2': { input_registers: [], holding_registers: [300, 400] }
      }
    },
    serverRegisters: {
      u: {
        '1': {
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: {
            '100': { value: 1, params: wideRegister(100) },
            '200': { value: 1, params: refusedGenerator(200) }
          }
        },
        '2': {
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: { '300': { value: 1, params: params(300) } }
        }
      }
    }
  })

  const usedHolding = (state: Record<string, unknown>, unitId: string): unknown => {
    const perUuid = state.usedAddresses as Record<string, Record<string, unknown>>
    const unit = perUuid.u?.[unitId] as Record<string, unknown>
    return unit.holding_registers
  }

  // 101 is the second half of the float at 100, so the rewrite reads the
  // width rather than the key it is stored under.
  it('drops the addresses of the register that went and keeps the span of the one that stayed', () => {
    const state = persisted()
    dropUnservableRegisters(state)

    expect(usedHolding(state, '1')).toEqual([100, 101])
  })

  // The step is gated on the store version, so a blob the drop has already run
  // over never reaches it twice. Unit 2 is that blob: the register it claims
  // 400 for is gone, and nothing is left to drop.
  it('corrects a unit nothing was dropped from', () => {
    const state = persisted()
    dropUnservableRegisters(state)

    expect(usedHolding(state, '2')).toEqual([300])
  })

  // `usedAddresses` is absent from a blob written before the field existed, and
  // reading a unit off a missing map throws rather than failing a schema.
  it('writes the map a blob carries no field for', () => {
    const state = persisted()
    delete state.usedAddresses
    dropUnservableRegisters(state)

    expect(usedHolding(state, '1')).toEqual([100, 101])
  })

  // `repairPersisted` reads the field whole and names it in what the user is
  // told, and it cannot name a value that was replaced before it looked.
  it('leaves a map that is not an object for the repair to name', () => {
    const state = persisted()
    state.usedAddresses = 'nonsense'
    dropUnservableRegisters(state)

    expect(state.usedAddresses).toBe('nonsense')
  })

  // The map is one persisted field, so a key its schema refuses costs every
  // unit in it. The same key costs `serverRegisters` alone.
  it('writes nothing for a unit id outside the map', () => {
    const state = persisted()
    const perUuid = state.serverRegisters as Record<string, Record<string, unknown>>
    const registers = perUuid.u as Record<string, unknown>
    registers['300'] = registers['2']
    dropUnservableRegisters(state)

    const used = state.usedAddresses as Record<string, Record<string, unknown>>
    expect(Object.keys(used.u ?? {})).toEqual(['1', '2'])
  })
})

describe('a persisted register the encoder cannot serve', () => {
  /** A fixed register at `address`, with `params` over the defaults. */
  const register = (
    address: number,
    overrides: Record<string, unknown>
  ): Record<string, unknown> => ({
    value: 1,
    params: { ...params(address), ...overrides }
  })

  const persisted = (
    registers: Record<string, Record<string, unknown>>
  ): Record<string, unknown> => ({
    serverRegisters: {
      u: {
        '1': {
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: registers
        }
      }
    }
  })

  const holding = (state: Record<string, unknown>): Record<string, unknown> => {
    const perUuid = state.serverRegisters as Record<string, Record<string, unknown>>
    const unit = perUuid.u?.['1'] as Record<string, unknown>
    return unit.holding_registers as Record<string, unknown>
  }

  // `Buffer.alloc(2e12)` answers ERR_OUT_OF_RANGE and `getUsedAddresses` loops
  // the same number, so the register that went is the one that hung the launch.
  it('drops a string wider than the map and keeps its neighbours', () => {
    const state = persisted({
      '0': register(0, { dataType: 'utf8', length: 10, stringValue: 'x', value: 0 }),
      '20': register(20, { dataType: 'utf8', length: 1e12, stringValue: 'x', value: 0 }),
      '40': register(40, {})
    })
    dropUnservableRegisters(state)

    expect(Object.keys(holding(state))).toEqual(['0', '40'])
  })

  it('drops a fixed value its data type cannot encode', () => {
    const state = persisted({
      '0': register(0, { value: 70000 }),
      '10': register(10, { dataType: 'int64', value: 1.5 }),
      '20': register(20, { value: 65535 })
    })
    dropUnservableRegisters(state)

    expect(Object.keys(holding(state))).toEqual(['20'])
  })

  it('drops a register that runs past address 65535', () => {
    const state = persisted({
      '65534': register(65534, { dataType: 'uint64', value: 1 }),
      '65532': register(65532, { dataType: 'uint64', value: 1 })
    })
    dropUnservableRegisters(state)

    expect(Object.keys(holding(state))).toEqual(['65532'])
  })

  // The drop on its own is not the store's behaviour; the step in `migrate` is.
  it('is dropped by the migration a shipped blob runs', () => {
    const state = migrateServerState(
      persisted({ '0': register(0, { value: 70000 }), '10': register(10, {}) }),
      SHIPPED_SERVER_VERSION
    )

    expect(Object.keys(holding(state))).toEqual(['10'])
  })

  it('is behind a version the store has moved past', () => {
    expect(CURRENT_SERVER_ZUSTAND_VERSION).toBeGreaterThan(SHIPPED_SERVER_VERSION)
  })
})

// `ServerRegisterEntrySchema.value` was `z.number()`, so every blob on disk
// carries a number for the three types whose composite fills 64 bits as an
// integer. The first word write after a launch reads that value, and a number
// carries 53 bits.
describe('a persisted 64 bit value', () => {
  const persisted = (dataType: string, value: unknown): Record<string, unknown> => ({
    serverRegisters: {
      u: {
        '1': {
          holding_registers: {
            '10': {
              value,
              params: {
                address: 10,
                registerType: 'holding_registers',
                dataType,
                comment: '',
                value: 0
              }
            }
          }
        }
      }
    }
  })

  const heldValue = (state: Record<string, unknown>): unknown => {
    const perUuid = state.serverRegisters as Record<string, Record<string, unknown>>
    const unit = perUuid.u?.['1'] as Record<string, unknown>
    const holding = unit.holding_registers as Record<string, Record<string, unknown>>
    return holding['10']?.value
  }

  it.each(['uint64', 'int64', 'datetime'])('becomes a string for %s', (dataType) => {
    const state = migrateServerState(persisted(dataType, 72623859790382850), SHIPPED_SERVER_VERSION)

    expect(heldValue(state)).toBe('72623859790382850')
  })

  it.each(['uint16', 'int32', 'double', 'float', 'unix'])('stays a number for %s', (dataType) => {
    const state = migrateServerState(persisted(dataType, 1234), SHIPPED_SERVER_VERSION)

    expect(heldValue(state)).toBe(1234)
  })

  // `toExact64Bits` answers nothing for a value no composite can be read out
  // of, and `applyRegisterValue` then leaves the entry where it is, so the grid
  // would show that value for every write from then on while main served the
  // new one. `String(0.5)` is `"0.5"` and `String(1e21)` is `"1e+21"`, and the
  // schema takes either as a number and neither as a string, so neither can be
  // written back as it is.
  it.each([0.5, 1e21, -0.25])('repairs a value of %p that no composite reads', (value) => {
    const state = migrateServerState(persisted('uint64', value), SHIPPED_SERVER_VERSION)

    expect(heldValue(state)).toBe('0')
  })

  it('leaves a value already stored as a string alone', () => {
    const state = migrateServerState(
      persisted('uint64', '18446744073709551615'),
      SHIPPED_SERVER_VERSION
    )

    expect(heldValue(state)).toBe('18446744073709551615')
  })

  it('is behind a version the store has moved past', () => {
    expect(CURRENT_SERVER_ZUSTAND_VERSION).toBeGreaterThan(SHIPPED_SERVER_VERSION)
  })
})

describe('a persisted mapping entry outside the map', () => {
  /** What 2.3.0 wrote, under the name `CURRENT_ROOT_ZUSTAND_VERSION`. */
  const SHIPPED_CLIENT_VERSION = 2

  const persistedMapping = (addresses: string[]): Record<string, unknown> => ({
    registerMapping: {
      coils: {},
      discrete_inputs: {},
      input_registers: {},
      holding_registers: Object.fromEntries(
        addresses.map((address) => [address, { dataType: 'uint16' }])
      )
    }
  })

  const holdingRegisters = (state: Record<string, unknown>): Record<string, unknown> => {
    const mapping = state.registerMapping as Record<string, Record<string, unknown>>
    return mapping.holding_registers as Record<string, unknown>
  }

  it('goes, and the entries beside it stay', () => {
    const state = persistedMapping(['0', '', '1e5', '100', '-1', 'Infinity', '65535', '65536'])
    dropUnmappableRegisters(state)

    expect(Object.keys(holdingRegisters(state))).toEqual(['0', '100', '65535'])
  })

  it('leaves a blob with no mapping alone', () => {
    const state: Record<string, unknown> = { name: 'bench' }
    dropUnmappableRegisters(state)

    expect(state).toEqual({ name: 'bench' })
  })

  // A hand-edited store is where a null in the middle of the walk comes from.
  it('walks past a null where a register type should be', () => {
    const state: Record<string, unknown> = { registerMapping: { coils: null } }
    dropUnmappableRegisters(state)

    expect(state).toEqual({ registerMapping: { coils: null } })
  })

  it('is behind a version the store has moved past', () => {
    expect(CURRENT_CLIENT_ZUSTAND_VERSION).toBeGreaterThan(SHIPPED_CLIENT_VERSION)
  })

  // The drop on its own is not the store's behaviour; the step in `migrate` is.
  it('is dropped by the migration a shipped blob runs', () => {
    const state = migrateClientState(persistedMapping(['100', '70000']), SHIPPED_CLIENT_VERSION)

    expect(Object.keys(holdingRegisters(state))).toEqual(['100'])
  })
})

import { describe, it, expect } from 'vitest'
import {
  ConnectionConfigSchema,
  RegisterConfigSchema,
  RegisterMapObjectSchema
} from '../types/client'
import { defaultConnectionConfig, defaultRegisterConfig } from '../default'
import { BitColorSchema, BitMapEntrySchema, BitMapConfigSchema } from '../types/bitmap'
import { RegisterParamsSchema, RemoveRegisterParamsSchema } from '../types/server'
import { DataBitsSchema, SerialPortOptionsSchema, StopBitsSchema } from '../types/serial'
import { MAX_UTF8_LENGTH } from '../utils'
import { ScanUnitIDParametersSchema } from '../types/scan'
import {
  MAX_READ_BITS,
  MAX_READ_REGISTERS,
  MAX_REGISTER_ADDRESS,
  maxReadQuantity,
  registersFrom
} from '../types/ranges'
import {
  isBooleanRegister,
  isNumberRegister,
  RegisterTypeSchema,
  type RegisterType
} from '../types/register'

describe('RegisterMapObjectSchema', () => {
  it('accepts numeric string keys', () => {
    const result = RegisterMapObjectSchema.safeParse({
      '0': { dataType: 'uint16' },
      '100': { dataType: 'int32' }
    })
    expect(result.success).toBe(true)
  })

  it('accepts the last address in the map', () => {
    expect(RegisterMapObjectSchema.safeParse({ '65535': {} }).success).toBe(true)
  })

  // The refine here was `!isNaN(Number(v))`, which takes every key below but
  // `abc`. None of them is an address a read can ask for.
  it.each(['abc', '', '1e5', '-1', 'Infinity', '65536', '1.5'])('rejects the key %o', (address) => {
    expect(RegisterMapObjectSchema.safeParse({ [address]: {} }).success).toBe(false)
  })

  // ! Coverage-only: trivial empty input, no real logic tested
  it('accepts empty object', () => {
    const result = RegisterMapObjectSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  // ! Coverage-only: trivial undefined value, no real logic tested
  it('accepts undefined values', () => {
    const result = RegisterMapObjectSchema.safeParse({
      '0': undefined
    })
    expect(result.success).toBe(true)
  })

  it('accepts register with bitMap config', () => {
    const result = RegisterMapObjectSchema.safeParse({
      '0': {
        dataType: 'bitmap',
        comment: 'status flags',
        bitMap: {
          '0': { comment: 'run', color: 'default' },
          '5': { comment: 'alarm', color: 'error', invert: true }
        }
      }
    })
    expect(result.success).toBe(true)
  })
})

describe('Server RegisterParamsSchema — bitMap', () => {
  const baseParams = {
    address: 10,
    registerType: 'holding_registers',
    dataType: 'bitmap',
    comment: 'status word',
    value: 0
  }

  it('accepts bitmap register with bitMap config', () => {
    const result = RegisterParamsSchema.safeParse({
      ...baseParams,
      bitMap: {
        '0': { comment: 'run' },
        '5': { comment: 'alarm' }
      }
    })
    expect(result.success).toBe(true)
  })

  it('accepts bitmap register without bitMap config', () => {
    const result = RegisterParamsSchema.safeParse(baseParams)
    expect(result.success).toBe(true)
  })

  it('rejects bitMap with invalid bit index', () => {
    const result = RegisterParamsSchema.safeParse({
      ...baseParams,
      bitMap: { '16': { comment: 'out of range' } }
    })
    expect(result.success).toBe(false)
  })
})

describe('BitColorSchema', () => {
  it.each(['default', 'warning', 'error'])('accepts "%s"', (color) => {
    expect(BitColorSchema.safeParse(color).success).toBe(true)
  })

  it('rejects invalid color', () => {
    expect(BitColorSchema.safeParse('blue').success).toBe(false)
  })
})

describe('BitMapEntrySchema', () => {
  it('accepts empty entry', () => {
    expect(BitMapEntrySchema.safeParse({}).success).toBe(true)
  })

  it('accepts comment only', () => {
    expect(BitMapEntrySchema.safeParse({ comment: 'run' }).success).toBe(true)
  })

  it('accepts all fields', () => {
    const result = BitMapEntrySchema.safeParse({
      comment: 'alarm',
      color: 'error',
      invert: true
    })
    expect(result.success).toBe(true)
  })

  it('accepts color + invert without comment', () => {
    const result = BitMapEntrySchema.safeParse({ color: 'warning', invert: false })
    expect(result.success).toBe(true)
  })

  it('rejects invalid color value', () => {
    const result = BitMapEntrySchema.safeParse({ color: 'purple' })
    expect(result.success).toBe(false)
  })

  it('rejects non-boolean invert', () => {
    const result = BitMapEntrySchema.safeParse({ invert: 'yes' })
    expect(result.success).toBe(false)
  })
})

describe('BitMapConfigSchema', () => {
  it('accepts valid bit indices (0–15)', () => {
    const result = BitMapConfigSchema.safeParse({
      '0': { comment: 'first' },
      '15': { comment: 'last', color: 'warning', invert: true }
    })
    expect(result.success).toBe(true)
  })

  it('rejects bit index > 15', () => {
    const result = BitMapConfigSchema.safeParse({
      '16': { comment: 'out of range' }
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative bit index', () => {
    const result = BitMapConfigSchema.safeParse({
      '-1': { comment: 'negative' }
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-numeric bit index', () => {
    const result = BitMapConfigSchema.safeParse({
      abc: { comment: 'invalid key' }
    })
    expect(result.success).toBe(false)
  })

  // Both writers spell the key `String(bitIndex)` over 0 to 15, and
  // `ServerBitMapDetail` and `BitMapDetailPanel` read it back the same way, so
  // each of these is a key a hand edit put there and nothing shows.
  it.each(['', ' ', '1.5', '1e1', '0x0', '+1', '\n'])(
    'rejects the bit index %j, which no reader asks for',
    (key) => {
      expect(BitMapConfigSchema.safeParse({ [key]: { comment: 'unreachable' } }).success).toBe(
        false
      )
    }
  )

  it.each(['0', '9', '10', '15'])('accepts the bit index %j', (key) => {
    expect(BitMapConfigSchema.safeParse({ [key]: { comment: 'read' } }).success).toBe(true)
  })

  it('accepts empty config', () => {
    expect(BitMapConfigSchema.safeParse({}).success).toBe(true)
  })
})

describe('ConnectionConfigSchema', () => {
  const withUnitId = (unitId: unknown): unknown => ({ ...defaultConnectionConfig, unitId })
  const withPort = (port: unknown): unknown => ({
    ...defaultConnectionConfig,
    tcp: {
      ...defaultConnectionConfig.tcp,
      options: { ...defaultConnectionConfig.tcp.options, port }
    }
  })

  it('accepts the config the app starts on', () => {
    expect(ConnectionConfigSchema.safeParse(defaultConnectionConfig).success).toBe(true)
  })

  it.each([0, 1, 255])('accepts unit id %s', (unitId) => {
    expect(ConnectionConfigSchema.safeParse(withUnitId(unitId)).success).toBe(true)
  })

  // 3.7 is in the list because `writeUInt8` truncates it to 3 rather than
  // throwing: an unchecked fractional id polls the wrong unit and says nothing.
  it.each([256, 999, -5, 3.7, Infinity])('refuses unit id %s', (unitId) => {
    expect(ConnectionConfigSchema.safeParse(withUnitId(unitId)).success).toBe(false)
  })

  it.each([0, 502, 65535])('accepts port %s', (port) => {
    expect(ConnectionConfigSchema.safeParse(withPort(port)).success).toBe(true)
  })

  it.each([65536, -1, 502.5])('refuses port %s', (port) => {
    expect(ConnectionConfigSchema.safeParse(withPort(port)).success).toBe(false)
  })

  // An install from before the field was dropped has it in localStorage, and
  // `repairPersistedStore` parses that blob. The key is stripped rather than
  // refused, so there is no migration.
  it('drops a tcp timeout a stored config still carries', () => {
    const stored = {
      ...defaultConnectionConfig,
      tcp: {
        ...defaultConnectionConfig.tcp,
        options: { ...defaultConnectionConfig.tcp.options, timeout: 5000 }
      }
    }
    const parsed = ConnectionConfigSchema.safeParse(stored)

    expect(parsed.success).toBe(true)
    expect(parsed.data?.tcp.options).toEqual({ port: 502 })
  })

  // `update_connection_config` guards on the partial, which is the door a
  // renderer reaches. Both ranges have to survive `deepPartial`.
  it('carries both ranges into the partial the ipc channel guards on', () => {
    const partial = ConnectionConfigSchema.deepPartial()

    expect(partial.safeParse({ unitId: 255 }).success).toBe(true)
    expect(partial.safeParse({ unitId: 999 }).success).toBe(false)
    expect(partial.safeParse({ tcp: { options: { port: 502 } } }).success).toBe(true)
    expect(partial.safeParse({ tcp: { options: { port: 65536 } } }).success).toBe(false)
  })
})

describe('RegisterConfigSchema', () => {
  const withField = (field: string, value: unknown): unknown => ({
    ...defaultRegisterConfig,
    [field]: value
  })

  it('accepts the config the app starts on', () => {
    expect(RegisterConfigSchema.safeParse(defaultRegisterConfig).success).toBe(true)
  })

  // Emptying the length field keeps 0 in the store and marks it invalid, so a
  // persisted 0 is a shipped state and has to survive a restart.
  it('accepts the length an emptied field leaves behind', () => {
    expect(RegisterConfigSchema.safeParse(withField('length', 0)).success).toBe(true)
  })

  // 1e6 is the one that reached `buf.writeUInt16BE` and threw a Node range
  // error into a snackbar.
  it.each([1e6, 65536, -5, 1.5])('refuses length %s', (length) => {
    expect(RegisterConfigSchema.safeParse(withField('length', length)).success).toBe(false)
  })

  it.each([0, 65535])('accepts address %s', (address) => {
    expect(RegisterConfigSchema.safeParse(withField('address', address)).success).toBe(true)
  })

  it.each([65536, -1, 1.5])('refuses address %s', (address) => {
    expect(RegisterConfigSchema.safeParse(withField('address', address)).success).toBe(false)
  })

  it.each(['pollRate', 'timeout'])('accepts %s at both ends of the slider', (field) => {
    expect(RegisterConfigSchema.safeParse(withField(field, 1000)).success).toBe(true)
    expect(RegisterConfigSchema.safeParse(withField(field, 10000)).success).toBe(true)
  })

  it.each(['pollRate', 'timeout'])('refuses %s off the slider', (field) => {
    expect(RegisterConfigSchema.safeParse(withField(field, 0)).success).toBe(false)
    expect(RegisterConfigSchema.safeParse(withField(field, 1500)).success).toBe(false)
    expect(RegisterConfigSchema.safeParse(withField(field, 11000)).success).toBe(false)
    expect(RegisterConfigSchema.safeParse(withField(field, -1000)).success).toBe(false)
  })

  // `update_register_config` guards on the partial, which is the door a
  // renderer reaches, and `setPollRate` and `setTimeout` now have no rule of
  // their own behind it.
  it('carries the ranges into the partial the ipc channel guards on', () => {
    const partial = RegisterConfigSchema.deepPartial()

    expect(partial.safeParse({ length: 10 }).success).toBe(true)
    expect(partial.safeParse({ length: 1e6 }).success).toBe(false)
    expect(partial.safeParse({ address: 65535 }).success).toBe(true)
    expect(partial.safeParse({ address: 65536 }).success).toBe(false)
    expect(partial.safeParse({ pollRate: 10000 }).success).toBe(true)
    expect(partial.safeParse({ pollRate: 1500 }).success).toBe(false)
    expect(partial.safeParse({ timeout: 11000 }).success).toBe(false)
  })
})

describe('Server RegisterParamsSchema — generator', () => {
  const generator = {
    address: 10,
    registerType: 'holding_registers',
    dataType: 'int16',
    comment: '',
    min: 0,
    max: 100,
    interval: 1000
  }

  it('accepts the interval the mask floor produces', () => {
    expect(RegisterParamsSchema.safeParse(generator).success).toBe(true)
  })

  // A generated timestamp reads the clock, so `toRegisterParams` pins both to 0.
  it('accepts min and max of zero', () => {
    expect(RegisterParamsSchema.safeParse({ ...generator, min: 0, max: 0 }).success).toBe(true)
  })

  // Above 2147483647 `setInterval` warns `TimeoutOverflowWarning` and sets the
  // duration to 1, so 1e12 fires every millisecond: the ceiling is Node's.
  it.each([0, -5, 500, 1000.5, 2147483648, 1e12])('refuses interval %s', (interval) => {
    expect(RegisterParamsSchema.safeParse({ ...generator, interval }).success).toBe(false)
  })

  it('accepts the highest interval setInterval holds', () => {
    expect(RegisterParamsSchema.safeParse({ ...generator, interval: 2147483647 }).success).toBe(
      true
    )
  })

  // The dialog lets one through and the generator covers the same range either
  // way, so a rule here would refuse what the Add button sends.
  it('accepts a min above its max', () => {
    expect(RegisterParamsSchema.safeParse({ ...generator, min: 10, max: 1 }).success).toBe(true)
  })

  // The union's other arm carries no interval to bound, and the refine sits on
  // the generator arm, so an intersection over both still takes a fixed value.
  it('accepts a fixed value', () => {
    const fixed = {
      address: generator.address,
      registerType: generator.registerType,
      dataType: generator.dataType,
      comment: generator.comment,
      value: 42
    }
    expect(RegisterParamsSchema.safeParse(fixed).success).toBe(true)
  })
})

// `RegisterParamsSchema` bounded the address and left `length` and `value`
// bare, so a config file reached the code that cannot take them:
// `createStringRegisters` is `Buffer.alloc(length * 2)`, and `addRegister`'s
// fixed branch hands the value straight to `createRegisters`.
describe('Server RegisterParamsSchema — the width and the value', () => {
  const fixed = (params: Record<string, unknown>): unknown => ({
    address: 0,
    registerType: 'holding_registers',
    comment: '',
    ...params
  })

  it.each([0, -1, 10.5, 1e9, 1e12])('refuses a string of length %s', (length) => {
    expect(
      RegisterParamsSchema.safeParse(
        fixed({ dataType: 'utf8', length, stringValue: 'x', value: 0 })
      ).success
    ).toBe(false)
  })

  it('accepts the widest string the dialog offers', () => {
    expect(
      RegisterParamsSchema.safeParse(
        fixed({ dataType: 'utf8', length: MAX_UTF8_LENGTH, stringValue: 'x', value: 0 })
      ).success
    ).toBe(true)
  })

  it('refuses a register that runs past address 65535', () => {
    expect(
      RegisterParamsSchema.safeParse(fixed({ address: 65534, dataType: 'uint64', value: 1 }))
        .success
    ).toBe(false)
    expect(
      RegisterParamsSchema.safeParse(fixed({ address: 65532, dataType: 'uint64', value: 1 }))
        .success
    ).toBe(true)
  })

  // `writeUInt16BE(70000)`, `writeInt16BE(40000)` and `BigInt(1.5)` all throw,
  // and each of the three passed this schema.
  it.each([
    ['uint16', 70000],
    ['uint16', -1],
    ['int16', 40000],
    ['int32', 2147483648],
    ['uint32', -1],
    ['int64', 1.5],
    ['uint64', -1],
    ['bitmap', 65536]
  ])('refuses %s value %s', (dataType, value) => {
    expect(RegisterParamsSchema.safeParse(fixed({ dataType, value })).success).toBe(false)
  })

  // The encoder takes these, so a rule refusing them would cost a working
  // config. `float` and `double` write anything, `unix` goes through
  // `value >>> 0` and `datetime` through the clamp in `encodeIEC870DateTime`.
  it.each([
    ['float', 1e300],
    ['double', -1e300],
    ['unix', -1],
    ['datetime', 0],
    ['uint16', 65535],
    ['int16', -32768]
  ])('accepts %s value %s', (dataType, value) => {
    expect(RegisterParamsSchema.safeParse(fixed({ dataType, value })).success).toBe(true)
  })

  it('names the field it refused', () => {
    const result = RegisterParamsSchema.safeParse(fixed({ dataType: 'uint16', value: 70000 }))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['value'])
  })

  // `registerWidth` reads `length` for `utf8` alone, so naming it for a
  // `uint64` that still carries one from an earlier edit points at a field with
  // no bearing on the width.
  it('names the address when the width is not the length', () => {
    const result = RegisterParamsSchema.safeParse(
      fixed({ address: 65534, dataType: 'uint64', value: 1, length: 4 })
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['address'])
  })

  // `removeRegister` loops `registerWidth(dataType, length)` times writing into
  // the register array, so the remove channel needs the bound add and sync have.
  it('holds a string to the same width on add, sync and remove', () => {
    const tooWide = { dataType: 'utf8', length: 125, stringValue: 'x', value: 0 }
    expect(RegisterParamsSchema.safeParse(fixed(tooWide)).success).toBe(false)
    expect(
      RemoveRegisterParamsSchema.safeParse({
        uuid: 'u',
        unitId: '1',
        registerType: 'holding_registers',
        address: 0,
        dataType: 'utf8',
        length: 125
      }).success
    ).toBe(false)
    expect(
      RegisterParamsSchema.safeParse(fixed({ ...tooWide, length: MAX_UTF8_LENGTH })).success
    ).toBe(true)
  })
})

// The generator draws between `min` and `max` and hands the draw to
// `createRegisters`, which throws on a value its type cannot hold. The draw
// runs in the constructor, so a range the data type cannot take throws out of
// `addRegister`. The dialog masks both fields to `getMinMaxValues(dataType)`
// already, so the rule refuses nothing the Add button sends.
describe('Server RegisterParamsSchema — what a generator draws between', () => {
  const generator = (overrides: Record<string, unknown>): unknown => ({
    address: 10,
    registerType: 'holding_registers',
    dataType: 'uint16',
    comment: '',
    min: 0,
    max: 100,
    interval: 1000,
    ...overrides
  })

  it.each([
    ['max', 1e9],
    ['max', 65536],
    ['min', -1]
  ])('refuses %s of %s on a uint16', (field, bound) => {
    const result = RegisterParamsSchema.safeParse(generator({ [field]: bound }))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([field])
  })

  it('takes a range the data type holds', () => {
    expect(RegisterParamsSchema.safeParse(generator({ min: 0, max: 65535 })).success).toBe(true)
    expect(
      RegisterParamsSchema.safeParse(generator({ dataType: 'uint32', max: 1e9 })).success
    ).toBe(true)
  })

  // `float` and `double` write anything, so the pair stays open there.
  it('leaves a float generator alone', () => {
    expect(
      RegisterParamsSchema.safeParse(generator({ dataType: 'float', min: -1e300, max: 1e300 }))
        .success
    ).toBe(true)
  })
})

// Nothing between the keyboard and the wire clamped: `LengthField` passed no
// `max`, `UintInput` defaults to 65535, `setLength` stores the number as given,
// `length` was `z.number().int().positive()`, and `_scanUnitIds` hands it to
// `this._readers[registerType](address, length)`, which writes it into the
// quantity field. A device answers illegal-data-value or says nothing, and the
// answer the user reads is about the request rather than about the bus.
describe('ScanUnitIDParametersSchema — the quantity that reaches the wire', () => {
  const parameters = (over: Record<string, unknown>): unknown => ({
    range: [1, 5],
    address: 0,
    length: 2,
    registerTypes: ['holding_registers'],
    timeout: 500,
    ...over
  })

  const takes = (over: Record<string, unknown>): boolean =>
    ScanUnitIDParametersSchema.safeParse(parameters(over)).success

  it('refuses more registers than one read answers', () => {
    expect(takes({ length: 126 })).toBe(false)
    expect(takes({ length: 65535 })).toBe(false)
    expect(takes({ length: MAX_READ_REGISTERS })).toBe(true)
  })

  it('refuses more bits than one read answers', () => {
    expect(takes({ registerTypes: ['coils'], length: 2001 })).toBe(false)
    expect(takes({ registerTypes: ['coils'], length: MAX_READ_BITS })).toBe(true)
  })

  // One length goes out for every type selected, so the strictest of them is
  // the one the request has to fit.
  it('holds a mixed selection to the stricter of the two', () => {
    expect(takes({ registerTypes: ['coils', 'holding_registers'], length: 2000 })).toBe(false)
    expect(takes({ registerTypes: ['coils', 'holding_registers'], length: 125 })).toBe(true)
  })

  it('names the length', () => {
    const result = ScanUnitIDParametersSchema.safeParse(parameters({ length: 65535 }))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['length'])
  })
})

describe('maxReadQuantity', () => {
  // MODBUS Application Protocol Specification V1.1b3 section 6: FC01 and FC02
  // answer at most 2000 bits, FC03 and FC04 at most 125 registers.
  it.each([
    [['coils'], MAX_READ_BITS],
    [['discrete_inputs'], MAX_READ_BITS],
    [['coils', 'discrete_inputs'], MAX_READ_BITS],
    [['input_registers'], MAX_READ_REGISTERS],
    [['holding_registers'], MAX_READ_REGISTERS],
    [['coils', 'holding_registers'], MAX_READ_REGISTERS]
  ] as [RegisterType[], number][])('answers %j with %i', (registerTypes, expected) => {
    expect(maxReadQuantity(registerTypes)).toBe(expected)
  })

  it('states the protocol rather than a habit', () => {
    expect(MAX_READ_BITS).toBe(2000)
    expect(MAX_READ_REGISTERS).toBe(125)
  })
})

// The other half of what a read asks for: `maxReadQuantity` says how much one
// response carries, this says how much is there.
describe('registersFrom', () => {
  it.each([
    [0, 65536],
    [65500, 36],
    [65534, 2],
    [MAX_REGISTER_ADDRESS, 1]
  ])('answers %i with %i', (address, expected) => {
    expect(registersFrom(address)).toBe(expected)
  })
})

describe('SerialPortOptionsSchema', () => {
  const withOptions = (options: Record<string, unknown>): unknown => ({
    baudRate: '9600',
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    ...options
  })

  it.each([8, 7, 6, 5])('accepts data bits %s', (dataBits) => {
    expect(SerialPortOptionsSchema.safeParse(withOptions({ dataBits })).success).toBe(true)
  })

  it.each([1, 2])('accepts stop bits %s', (stopBits) => {
    expect(SerialPortOptionsSchema.safeParse(withOptions({ stopBits })).success).toBe(true)
  })

  // `bindings-cpp` merges these into its defaults and hands them to the native
  // binding without checking either, so the schema is the only refusal.
  it.each([99, 4, 9, 0, 8.5])('refuses data bits %s', (dataBits) => {
    expect(SerialPortOptionsSchema.safeParse(withOptions({ dataBits })).success).toBe(false)
  })

  it.each([7, 0, 3, 1.5])('refuses stop bits %s', (stopBits) => {
    expect(SerialPortOptionsSchema.safeParse(withOptions({ stopBits })).success).toBe(false)
  })

  // The selects build their menus from these, so a value on offer is a value
  // the schema takes.
  it('offers exactly what the selects list', () => {
    expect(DataBitsSchema.options.map((option) => option.value)).toEqual([8, 7, 6, 5])
    expect(StopBitsSchema.options.map((option) => option.value)).toEqual([1, 2])
  })
})

describe('isNumberRegister and isBooleanRegister', () => {
  // Seven sites wrote one of the two pairs out by hand, and a list written out
  // does not grow when the enum does. Both predicates read `.options`, so this
  // asks the question that answer settles: every register type is one or the
  // other, and neither predicate takes something that is not a register type.
  it.each(RegisterTypeSchema.options)('sorts %s into exactly one of the two', (registerType) => {
    expect(isNumberRegister(registerType)).toBe(!isBooleanRegister(registerType))
  })

  it.each(['', 'holding', 'Coils', 'input_register'])('refuses %o', (notARegisterType) => {
    expect(isNumberRegister(notARegisterType)).toBe(false)
    expect(isBooleanRegister(notARegisterType)).toBe(false)
  })
})

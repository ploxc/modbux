import z from 'zod'
import { DataTypeSchema } from './datatype'
import { BitMapConfigSchema } from './bitmap'
import { PortSchema, RegisterAddressKeySchema, RegisterAddressSchema } from './ranges'
import { SerialPortOptionsSchema } from './serial'
import { UnitIdString, UnitIdStringSchema } from './unitid'
import { getAddressFitError, getValueRangeError, MAX_UTF8_LENGTH } from '../encoding'
import {
  BooleanRegisters,
  BooleanRegistersSchema,
  NumberRegisters,
  NumberRegistersSchema,
  RegisterType
} from './register'

/**
 * The uuid a server is addressed by, which ten schemas spelled out by hand.
 *
 * `delete_server` and `reset_server` take this uuid and nothing else, and took
 * it unguarded. Every object channel carrying one states the rule, so those two
 * were the only doors to a server that did not.
 */
export const ServerUuidSchema = z.string().min(1)

// Server mode (global: TCP or RTU)
export const ServerModeSchema = z.enum(['tcp', 'rtu'])
export type ServerMode = z.infer<typeof ServerModeSchema>

// Server serial config for RTU mode
export const ServerSerialConfigSchema = z.object({
  com: z.string(),
  options: SerialPortOptionsSchema
})
export type ServerSerialConfig = z.infer<typeof ServerSerialConfigSchema>

export const StartRtuServerParamsSchema = z.object({
  uuid: ServerUuidSchema,
  serialConfig: ServerSerialConfigSchema
})
export type StartRtuServerParams = z.infer<typeof StartRtuServerParamsSchema>

/**
 * What a generated register varies between, and how often.
 *
 * The interval is typed in whole seconds through a mask with a floor of 1 and
 * stored in milliseconds, so anything below a second reaches this only from a
 * config file. An interval of 0 is the one that costs: `valueGenerator` hands
 * it to `setInterval`, and an interval of 0 fired 78 times in 100 ms when
 * measured. The ceiling is Node's rather than the mask's: above 2147483647 it
 * warns `TimeoutOverflowWarning` and sets the duration to 1, so an interval of
 * 1e12 fires every millisecond, which is the flood the floor prevents.
 *
 * `min` and `max` are each held to their own data type, in the refine below,
 * because the generator draws between them and hands the draw to
 * `createRegisters`, which throws on a value its type cannot hold.
 * `ValueGenerator` writes its first value from its own constructor and
 * `_updateValue` is synchronous, so that throw leaves `addRegister` and takes
 * every register after it in the unit `syncServerRegisters` was restoring. The
 * draws after the first are `setInterval`'s, where the same throw is an
 * uncaught exception in main.
 *
 * The reason they were bare was that a rule here would refuse what the Add
 * button sends and cost the whole persisted register map, and both halves were
 * measured false. `useMinMaxInteger` already masks both fields to
 * `getMinMaxValues(dataType)` over the same seven types, so switching a
 * generator from `uint32` to `uint16` rewrites a max of 100000 to 65535 and
 * reports it valid. And one register the schema refuses costs that register
 * now, because the store's v3 to v4 step drops it and keeps the rest.
 *
 * A min above a max is not a rule here. The dialog lets one through, and
 * `Math.random() * (max - min) + min` covers the same range either way: ten
 * thousand draws of min 100 max 10 ran 10 to 100, the same as min 10 max 100.
 */
const RegisterParamsGeneratorPartSchema = z.object({
  min: z.number(),
  max: z.number(),
  interval: z.number().int().min(1000).max(2147483647),
  value: z.undefined() // Explicitly forbid 'value'
})
export type RegisterParamsGeneratorPart = z.infer<typeof RegisterParamsGeneratorPartSchema>

const RegisterParamsStaticPartSchema = z.object({
  value: z.number(),
  min: z.undefined(),
  max: z.undefined(),
  interval: z.undefined()
})

export type RegisterValue<K extends RegisterType = RegisterType> = {
  [P in K]: {
    uuid: string
    unitId: UnitIdString
    registerType: P
    address: number
    value: ServerDataValue<P>
  }
}[K]

/**
 * Base fields shared by both variants.
 *
 * This is the schema a saved config file arrives on, through
 * `ServerRegistersPerUnitSchema`, and the one `add_replace_server_register` and
 * `sync_server_register` take. `remove_server_register` takes
 * `RegisterAddressSchema`, so while this field was a bare number an address
 * outside the map went in and could not come back out.
 *
 * `length` is the width of a string, and it is the one field the width of the
 * register is read off. Left bare, `length: 1e12` passed here and reached
 * `createStringRegisters`, which is `Buffer.alloc(2e12)`: inside Electron 43
 * that answers ERR_OUT_OF_RANGE, and `length: 1e9` allocates and then builds a
 * billion words instead. `getUsedAddresses` loops the same number. The ceiling
 * is `MAX_UTF8_LENGTH`, which `RegisterLengthInput` masks to.
 */
const RegisterParamsBasePartSchema = z.object({
  address: RegisterAddressSchema,
  registerType: NumberRegistersSchema,
  dataType: DataTypeSchema,
  comment: z.string(),
  length: z.number().int().min(1).max(MAX_UTF8_LENGTH).optional(),
  stringValue: z.string().optional(),
  bitMap: BitMapConfigSchema.optional()
})
export type RegisterParamsBasePart = z.infer<typeof RegisterParamsBasePartSchema>

/**
 * Two rules over fields that bound each other, which is why they sit here
 * rather than beside the fields.
 *
 * The register has to fit the map. `address` is 16 bit and `length` is bounded
 * above, and a register can still run off the end: the add dialog refuses that
 * with `getAddressFitError`, and a config file did not ask.
 *
 * A fixed value has to be one its own `dataType` can encode, which is
 * `getValueRangeError`. The pair is the rule, not the field: 70000 is a
 * `uint32` and not a `uint16`, and `addRegister`'s fixed branch hands whatever
 * arrives straight to `createRegisters`.
 *
 * A generator's `min` and `max` go through the same rule as a fixed value, for
 * the reason `RegisterParamsGeneratorPartSchema` states: the draw between them
 * is what reaches the encoder.
 *
 * All three are stated where the add dialog states them, so the file and the
 * field answer the same question.
 */
export const RegisterParamsSchema = RegisterParamsBasePartSchema.and(
  z.union([RegisterParamsGeneratorPartSchema, RegisterParamsStaticPartSchema])
).superRefine((params, ctx) => {
  if (getAddressFitError(params.dataType, params.address, params.length)) {
    // `registerWidth` reads `length` for `utf8` alone, so naming it for any
    // other type points at a field with no bearing on the width. A `uint64`
    // that still carries a `length` from an earlier edit is one of those.
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [params.dataType === 'utf8' ? 'length' : 'address'],
      message: `A ${params.dataType} register at ${params.address} runs past address 65535`
    })
  }

  for (const field of ['value', 'min', 'max'] as const) {
    const bound = params[field]
    if (bound === undefined) continue
    const rangeError = getValueRangeError(params.dataType, bound)
    if (rangeError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: rangeError })
    }
  }
})
export type RegisterParams = z.infer<typeof RegisterParamsSchema>

// Schema for a single boolean entry with optional comment
export const ServerBoolEntrySchema = z.object({
  value: z.boolean(),
  comment: z.string().optional()
})
export type ServerBoolEntry = z.infer<typeof ServerBoolEntrySchema>

// Schema for a boolean dictionary keyed by address
export const ServerBoolSchema = z.record(RegisterAddressKeySchema, ServerBoolEntrySchema)
export type ServerBool = z.infer<typeof ServerBoolSchema>

/**
 * One register entry: what it holds, and the parameters that say what it is.
 *
 * `value` takes a string as well as a number, for the three types whose
 * composite fills 64 bits as an integer. See `ServerRegisterValue`. A string
 * that is not a decimal integer is refused here, so `toExact64Bits` has a
 * number or digits to read.
 */
export const ServerRegisterEntrySchema = z.object({
  value: z.union([z.number(), z.string().regex(/^-?\d+$/)]),
  params: RegisterParamsSchema
})
export type ServerRegisterEntry = z.infer<typeof ServerRegisterEntrySchema>

/**
 * A dictionary of register entries keyed by address, each naming its address
 * once.
 *
 * The key and `params.address` are one address written twice, and both are
 * read: `ServerRegisters` draws `params.address` and `syncRegistersWithBackend`
 * sends it, while `setRegisterValue` and `removeRegister` look the entry up by
 * key. Where the two disagree the register is served at one address and
 * answered for at the other, so a generator's words arrive at a key holding
 * nothing and are dropped, and Delete takes the register out of main and leaves
 * the row in the grid.
 *
 * Compared as strings, because that is how the store spells a lookup. `'007'`
 * passes `RegisterAddressKeySchema`, and `registers[String(7)]` finds nothing
 * under it.
 */
export const ServerRegisterSchema = z
  .record(RegisterAddressKeySchema, ServerRegisterEntrySchema)
  .superRefine((registers, context) => {
    for (const [address, entry] of Object.entries(registers)) {
      if (String(entry.params.address) === address) continue
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [address, 'params', 'address'],
        message: `Register keyed ${address} names address ${entry.params.address}`
      })
    }
  })
export type ServerRegister = z.infer<typeof ServerRegisterSchema>

// Schema representing all register types for a server
export const ServerRegistersSchema = z.object({
  coils: ServerBoolSchema,
  discrete_inputs: ServerBoolSchema,
  input_registers: ServerRegisterSchema,
  holding_registers: ServerRegisterSchema
} satisfies {
  [K in RegisterType]: K extends BooleanRegisters
    ? typeof ServerBoolSchema
    : typeof ServerRegisterSchema
})
export type ServerRegisters = z.infer<typeof ServerRegistersSchema>

/**
 * The register map, keyed by unit id.
 *
 * The value is optional rather than a union with `z.undefined()`, because a
 * union answers `invalid_union` at its own path and keeps what each branch said
 * out of `issues`. One malformed register was refused as
 * `serverRegistersPerUnit.1: Invalid input`, naming neither the address nor the
 * field.
 */
export const ServerRegistersPerUnitSchema = z.record(
  UnitIdStringSchema,
  ServerRegistersSchema.optional()
)
export type ServerRegistersPerUnit = z.infer<typeof ServerRegistersPerUnitSchema>

// Final server config schema (v2 with metadata)
export const ServerConfigSchema = z.object({
  version: z.number(),
  modbuxVersion: z.string(),
  name: z.string(),
  littleEndian: z.boolean(),
  serverRegistersPerUnit: ServerRegistersPerUnitSchema
})
export type ServerConfig = z.infer<typeof ServerConfigSchema>

//
//
//
//
//

// Regular types
export const AddRegisterParamsSchema = z.object({
  uuid: ServerUuidSchema,
  unitId: UnitIdStringSchema,
  params: RegisterParamsSchema
})
export type AddRegisterParams = z.infer<typeof AddRegisterParamsSchema>
export const RemoveRegisterParamsSchema = z.object({
  uuid: ServerUuidSchema,
  unitId: UnitIdStringSchema,
  registerType: NumberRegistersSchema,
  address: RegisterAddressSchema,
  dataType: DataTypeSchema,
  // Only a string has a width the user chose, and without it the server has to
  // guess how much of the map the register occupied and erases the guess.
  // Bounded the way add and sync bound it: `removeRegister` loops
  // `registerWidth(dataType, length)` times writing into the register array.
  length: z.number().int().min(1).max(MAX_UTF8_LENGTH).optional()
})
export type RemoveRegisterParams = z.infer<typeof RemoveRegisterParamsSchema>

export const SyncRegisterValueParamsSchema = z.object({
  uuid: ServerUuidSchema,
  unitId: UnitIdStringSchema,
  registerValues: z.array(RegisterParamsSchema)
})

export type SyncRegisterValueParams = z.infer<typeof SyncRegisterValueParamsSchema>

/**
 * The byte order a server encodes its registers in.
 *
 * It belongs to the server rather than to a register: the v1 to v2 migration
 * took it off each register, and every write that carried it afterwards read
 * the same field of the same server. The server keeps it, and a write says
 * which registers to encode rather than how.
 */
export const ServerEndiannessSchema = z.object({
  uuid: ServerUuidSchema,
  littleEndian: z.boolean()
})
export type ServerEndianness = z.infer<typeof ServerEndiannessSchema>

export const ResetRegistersParamsSchema = z.object({
  uuid: ServerUuidSchema,
  unitId: UnitIdStringSchema,
  registerType: NumberRegistersSchema
})
export type ResetRegistersParams = z.infer<typeof ResetRegistersParamsSchema>

export const SetBooleanParametersSchema = z.object({
  uuid: ServerUuidSchema,
  unitId: UnitIdStringSchema,
  registerType: BooleanRegistersSchema,
  address: RegisterAddressSchema,
  state: z.boolean()
})
export type SetBooleanParameters = z.infer<typeof SetBooleanParametersSchema>

export const ResetBoolsParamsSchema = z.object({
  uuid: ServerUuidSchema,
  unitId: UnitIdStringSchema,
  registerType: BooleanRegistersSchema
})
export type ResetBoolsParams = z.infer<typeof ResetBoolsParamsSchema>

export const SyncBoolsParametersSchema = z.object({
  uuid: ServerUuidSchema,
  unitId: UnitIdStringSchema,
  coils: z.array(z.boolean()),
  discrete_inputs: z.array(z.boolean())
})
export type SyncBoolsParameters = z.infer<typeof SyncBoolsParametersSchema>

export const CreateServerParamsSchema = z.object({
  uuid: ServerUuidSchema,
  port: PortSchema
})
export type CreateServerParams = z.infer<typeof CreateServerParamsSchema>

/** Which of the two values each register type holds. */
type ServerDataValues = {
  coils: boolean
  discrete_inputs: boolean
  input_registers: number
  holding_registers: number
}

/** A bit for the two boolean register types, a word for the other two. */
export type ServerDataValue<K extends RegisterType> = ServerDataValues[K]

/**
 * What one unit holds, per register type, keyed by address.
 *
 * A map rather than four arrays of 65536. A unit exists the first time a
 * mutator names one, and the arrays cost 2.00 MB per unit id whether or not an
 * address under them is used, measured over ten unit ids with `--expose-gc`.
 *
 * The trade inverts where every address is written. A remote client may write
 * any coil and any holding register on a unit the server hosts, and those two
 * maps full cost 3.50 MB per unit id against the arrays' 2.00 MB, measured the
 * same way.
 *
 * An address with no entry reads as the fallback the accessor carries, which is
 * the zero and the false the arrays answered. The arrays also answered
 * `undefined` past their last index, and that is the one thing a map cannot
 * say, so `_get` tests the address against `MAX_REGISTER_ADDRESS` itself.
 */
export type ServerData = { [K in RegisterType]: Map<number, ServerDataValues[K]> }

/**
 * What the server needs of a running generator, which is only the teardown.
 *
 * shared is imported by all three processes, so it may not reach into main for
 * a type. ValueGenerator implements this instead, which leaves the dependency
 * pointing the one way it is allowed to point.
 */
export interface RegisterValueGenerator {
  dispose: () => void
}

export type ValueGenerators = {
  [key in NumberRegisters]: Map<number, RegisterValueGenerator>
}

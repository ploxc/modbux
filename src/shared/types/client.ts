import z from 'zod'
import { BaseDataTypeSchema, DataTypeSchema } from './datatype'
import { BitMapConfigSchema } from './bitmap'
import {
  MAX_WRITE_BITS,
  PortSchema,
  RegisterAddressKeySchema,
  RegisterAddressSchema,
  UnitIdSchema
} from './ranges'
import { RegisterType, RegisterTypeSchema } from './register'
import { SerialPortOptionsSchema } from './serial'

//
//
// Register Mapping
export const RegisterLinearInterpolationSchema = z.object({
  x1: z.string(),
  x2: z.string(),
  y1: z.string(),
  y2: z.string()
})
export type RegisterLinearInterpolation = z.infer<typeof RegisterLinearInterpolationSchema>

export const RegisterMapValueSchema = z.object({
  dataType: DataTypeSchema.optional(),
  scalingFactor: z.number().optional(),
  comment: z.string().optional(),
  interpolate: RegisterLinearInterpolationSchema.optional(),
  groupEnd: z.boolean().optional(),
  bitMap: BitMapConfigSchema.optional()
})
export type RegisterMapValue = z.infer<typeof RegisterMapValueSchema>

/**
 * What the client knows about each address, keyed by that address.
 *
 * The key was `!isNaN(Number(v))`, which takes `''`, `'1e5'`, `'-1'` and
 * `'Infinity'`, none of which is an address a read can ask for.
 * `RegisterAddressKeySchema` is the same key the server's maps take.
 */
export const RegisterMapObjectSchema = z.record(
  RegisterAddressKeySchema,
  RegisterMapValueSchema.optional()
)
export type RegisterMapObject = Record<number, RegisterMapValue | undefined>

export const RegisterMappingSchema = z.object({
  coils: RegisterMapObjectSchema,
  discrete_inputs: RegisterMapObjectSchema,
  input_registers: RegisterMapObjectSchema,
  holding_registers: RegisterMapObjectSchema
} satisfies Record<RegisterType, typeof RegisterMapObjectSchema>)
export type RegisterMapping = z.infer<typeof RegisterMappingSchema>

// Client config schema (v2 with metadata)
export const RegisterMapConfigSchema = z.object({
  version: z.number(),
  modbuxVersion: z.string(),
  name: z.string().optional(),
  littleEndian: z.boolean(),
  registerMapping: RegisterMappingSchema
})
export type RegisterMapConfig = z.infer<typeof RegisterMapConfigSchema>

//
//
// Transaction
export const TransactionSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  unitId: UnitIdSchema,
  /**
   * The data address the request asked for, and undefined where it cannot be
   * read.
   *
   * `_requestedAddress` takes it off bytes 2 and 3 of the request frame, which
   * every function code Modbux sends puts it at, and falls back on
   * `nextDataAddress`, which modbus-serial files for three of them. Both are
   * gone only for a frame that never went out, and `columns.tsx` binds
   * `field: 'address'` with no formatter, so the cell is blank there.
   */
  address: RegisterAddressSchema.optional(),
  code: z.number(),
  responseLength: z.number(),
  timeout: z.boolean(),
  request: z.string(),
  responses: z.array(z.string()),
  errorMessage: z.string().optional() // optional means it can be undefined
})

export type Transaction = z.infer<typeof TransactionSchema>

//
//
// Connection config
export const ProtocolSchema = z.enum(['ModbusTcp', 'ModbusRtu', 'ModbusRtuOverTcp'])
export type Protocol = z.infer<typeof ProtocolSchema>

/**
 * How each transport is named to the user. RTU over TCP is the one worth
 * spelling out: it reuses the TCP host and port and keeps the TCP button
 * selected, so nothing on screen distinguishes it from plain TCP.
 */
export const PROTOCOL_LABELS: Record<Protocol, string> = {
  ModbusTcp: 'Modbus TCP',
  ModbusRtu: 'Modbus RTU',
  ModbusRtuOverTcp: 'RTU over TCP'
}

/**
 * The part of modbus-serial's `TcpPortOptions` Modbux sets.
 *
 * Its `timeout` is not here, because `connectTCP` and `connectTelnet` both
 * overwrite `options.timeout` with the client's own before they construct the
 * port. `registerConfig.timeout` is the one a user sets, and `_read` applies it
 * per request.
 */
export const TcpPortOptionsSchema = z.object({
  port: PortSchema
})
export type TcpPortOptions = z.infer<typeof TcpPortOptionsSchema>

export const ConnectionConfigTcpSchema = z.object({
  host: z.string(),
  options: TcpPortOptionsSchema
})

export const ConnectionConfigRtuSchema = z.object({
  com: z.string(),
  options: SerialPortOptionsSchema
})

/**
 * The unit id and the port the client sends, on the range the protocol fixes.
 *
 * The server checks every unit id that arrives, with `UnitIdStringSchema` in
 * every getter and setter, and it is the same byte going the other way. The
 * mask inputs hold both fields to these ranges, so what is left for a schema to
 * refuse is the persisted store and `update_connection_config`.
 */
export const ConnectionConfigSchema = z.object({
  protocol: ProtocolSchema,
  unitId: UnitIdSchema,
  tcp: ConnectionConfigTcpSchema,
  rtu: ConnectionConfigRtuSchema
})
export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>

//
//
//
//
//

// WriteParameters
export const WriteParametersSchema = z
  .object({
    address: RegisterAddressSchema,
    single: z.boolean()
  })
  .and(
    z.union([
      z.object({
        type: z.literal('coils'),
        // FC15 carries the data as well as the address and the quantity, so it
        // stops 32 bits short of what FC01 answers. The dialog writes over the
        // window the toolbar read, and that window is 2000 wide.
        value: z.array(z.boolean()).max(MAX_WRITE_BITS),
        dataType: z.undefined()
      }),
      z.object({
        type: z.literal('holding_registers'),
        value: z.number(),
        dataType: BaseDataTypeSchema
      })
    ])
  )
export type WriteParameters = z.infer<typeof WriteParametersSchema>

//
//
// Client state
export const ConnectStateSchema = z.enum([
  'connected',
  'disconnected',
  'connecting',
  'disconnecting'
])

/**
 * Whether a host or a COM port names somewhere to connect.
 *
 * `ConnectionConfigSchema` types both as a bare string and takes a blank one,
 * so the boundary has nothing to refuse and main held a connection config
 * naming no port. `setHost` and `setCom` carry a flag instead, and this is the
 * one test behind it: `HostInput` and the COM field each spelled it out, and
 * `init` had to answer it again for a blob coming off disk, because
 * `partialize` persists `connectionConfig` and not `valid`.
 */
export const isConnectionAddressGiven = (value: string): boolean => value.trim().length > 0

/**
 * Whether a read length asks for any registers.
 *
 * `RegisterConfigSchema` takes 0, which its own docblock calls a shipped state:
 * `setLength` keeps a cleared field in the store and marks it invalid rather
 * than sending it. So the flag is what says the field is empty, and `init` has
 * to answer it for a blob coming off disk the way it does for the two
 * addresses.
 */
export const isReadLengthGiven = (length: number): boolean => length > 0

export const ClientStateSchema = z.object({
  connectState: ConnectStateSchema,
  polling: z.boolean(),
  scanningUnitIds: z.boolean(),
  scanningRegisters: z.boolean(),
  reading: z.boolean(),
  writing: z.boolean()
})
export type ClientState = z.infer<typeof ClientStateSchema>

//
//
// Register config

/**
 * A poll rate and a read timeout, in milliseconds.
 *
 * Both come from `SliderComponent`, which runs 1 to 10 with a step of 1 and
 * multiplies by a thousand. Stating that here is what lets `setPollRate` and
 * `setTimeout` drop the copy of it they each carried.
 */
const ReadTimingSchema = z.number().int().min(1000).max(10000).multipleOf(1000)

/**
 * What the client reads, and how long it gives the device to answer.
 *
 * This is both the `update_register_config` payload and the persisted half of
 * the client store, so the rules here decide what a hand-edited `localStorage`
 * blob keeps. `length` admits 0 for that reason: emptying the length field
 * keeps the value in the store and marks it invalid rather than sending it, so
 * 0 is a shipped state and 65536 is not. A length above the 16 bit range
 * reached `buf.writeUInt16BE` and threw a Node range error into a snackbar.
 */
export const RegisterConfigSchema = z.object({
  address: RegisterAddressSchema,
  length: z.number().int().min(0).max(65535),
  type: RegisterTypeSchema,
  pollRate: ReadTimingSchema,
  timeout: ReadTimingSchema,
  littleEndian: z.boolean(),
  advancedMode: z.boolean(),
  show64BitValues: z.boolean(),
  addressBase: z.enum(['0', '1'])
})
export type RegisterConfig = z.infer<typeof RegisterConfigSchema>

//
//
// Register Data
export interface RegisterData {
  id: number
  buffer: Uint8Array
  hex: string
  words: RegisterDataWords | undefined
  bit: boolean
  isScanned: boolean
  error?: string
  groupIndex?: number
}

export interface RegisterDataWords {
  ['int16']: number
  ['uint16']: number
  ['int32']: number
  ['uint32']: number
  ['unix']: string
  ['float']: number
  ['int64']: bigint
  ['uint64']: bigint
  ['double']: number
  ['datetime']: string
  ['utf8']: string
}

export interface RawTransaction {
  nextAddress: number
  /**
   * The data address, filed by two of modbus-serial's twelve transaction
   * records.
   *
   * `writeFC4` at index.js:880 and `writeFC6` at 983 set it, and `writeFC1`
   * delegates to `writeFC2` and `writeFC3` to `writeFC4`, so FC3, FC4 and FC6
   * carry one and FC1, FC2, FC5, FC15 and FC16 do not. This said `number` and
   * `_logTransaction` read it, so the Addr cell was blank for every coil read,
   * every discrete input read and every write Modbux sends.
   */
  nextDataAddress?: number
  nextCode: number
  nextLength: number
  // next: [Function: cb],
  _timeoutFired: boolean
  //_timeoutHandle: undefined,
  // Both are stashed only while modbus-serial is in debug mode, and only by
  // the write that reaches the port. A transaction can carry neither.
  request?: Buffer
  responses?: Buffer[]
}

export type AddressGroup = [number, number]

//
//
// Serial port discovery
export interface SerialPortInfo {
  path: string
  manufacturer?: string
}

export interface SerialPortValidationResult {
  valid: boolean
  message: string
}

import z from 'zod'
import { DataType, DataTypeSchema } from './datatype'
import { BitMapConfigSchema } from './bitmap'
import { registerWidth } from '../encoding'
import {
  MAX_SERIAL_UNIT_ID,
  MAX_UNIT_ID,
  MAX_WRITE_BITS,
  PortSchema,
  RegisterAddressKeySchema,
  RegisterAddressSchema,
  UnitIdSchema,
  registersFrom
} from './ranges'
import { RegisterType, RegisterTypeSchema } from './register'
import { SerialPortOptionsSchema } from './serial'

//
//
// Register Mapping
const RegisterLinearInterpolationSchema = z.object({
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
const TransactionSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  unitId: UnitIdSchema,
  /**
   * The data address the request asked for, and undefined where it cannot be
   * read.
   *
   * `requestedAddress` takes it off bytes 2 and 3 of the request frame, which
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
const ProtocolSchema = z.enum(['ModbusTcp', 'ModbusRtu', 'ModbusRtuOverTcp'])
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
 * The highest unit id a protocol addresses. RTU over TCP carries the serial
 * frame, so it takes the serial line's range.
 */
export const maxUnitId = (protocol: Protocol): number =>
  protocol === 'ModbusTcp' ? MAX_UNIT_ID : MAX_SERIAL_UNIT_ID

/**
 * Why a unit id is out of its protocol's range, or undefined when it is not.
 *
 * `ConnectionConfigSchema` does not refuse the pair. A 2.3.0 config holds an
 * RTU client on 248 to 255, and switching to RTU keeps the id TCP allowed, so
 * the config keeps it and main refuses to send it until the user changes it.
 */
export const unitIdOutOfRange = ({
  protocol,
  unitId
}: Pick<ConnectionConfig, 'protocol' | 'unitId'>): string | undefined => {
  const max = maxUnitId(protocol)
  return unitId > max ? `${PROTOCOL_LABELS[protocol]} stops at ${max}` : undefined
}

/**
 * The part of modbus-serial's `TcpPortOptions` Modbux sets.
 *
 * Its `timeout` is not here, because `connectTCP` and `connectTelnet` both
 * overwrite `options.timeout` with the client's own before they construct the
 * port. `registerConfig.timeout` is the one a user sets, and `_read` applies it
 * per request.
 */
const TcpPortOptionsSchema = z.object({
  port: PortSchema
})

const ConnectionConfigTcpSchema = z.object({
  host: z.string(),
  options: TcpPortOptionsSchema
})

const ConnectionConfigRtuSchema = z.object({
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

/**
 * The connection a config opens, named so two configs naming one connection
 * compare equal.
 *
 * One request at a time is a property of the connection, not of the client: an
 * RS485 bus is half duplex, an RTU frame carries no transaction id to match a
 * reply to, and a gateway may take one connection at a time. So every client
 * whose config gives the same key rides one connection and one queue. Plain TCP
 * follows the same rule, so there is one. The protocol is part of the key
 * because the framing is: a TCP client and an RTU over TCP client to one host
 * cannot share a socket.
 *
 * A port name compares without case, as `validateSerialPort` compares it, and
 * so does a host name. Two names for one address, `localhost` and `127.0.0.1`,
 * stay two keys: telling them apart would take a lookup.
 */
export const transportKey = ({ protocol, tcp, rtu }: ConnectionConfig): string =>
  protocol === 'ModbusRtu'
    ? `${protocol}:${rtu.com.trim().toLowerCase()}`
    : `${protocol}:${tcp.host.trim().toLowerCase()}:${tcp.options.port}`

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
        dataType: DataTypeSchema
      })
    ])
  )
  // What the write reaches has to end on an address there is: an int32 at
  // 65535 went out as FC16 for 65535 and 65536.
  .superRefine((parameters, ctx) => {
    const width =
      parameters.type === 'coils' ? parameters.value.length : registerWidth(parameters.dataType)
    const available = registersFrom(parameters.address)
    if (width <= available) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['address'],
      message: `A write of ${width} from ${parameters.address} runs past the last address`
    })
  })
export type WriteParameters = z.infer<typeof WriteParametersSchema>

//
//
// Client state
const ConnectStateSchema = z.enum(['connected', 'disconnected', 'connecting', 'disconnecting'])
export type ConnectState = z.infer<typeof ConnectStateSchema>

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
  /** The device left enough polls in a row unanswered that it is polled less often. */
  offline: z.boolean(),
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
  /** How many polls in a row a device may leave unanswered before it is offline. */
  offlineAfterTimeouts: z.number().int().min(1).max(100),
  /** How far apart, in milliseconds, the polls of an offline device may get. */
  maxPollInterval: z.number().int().min(1000).max(3_600_000),
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

/**
 * The word a row carries for `dataType`, or nothing.
 *
 * `none` and `bitmap` carry no word; every other data type is a key of
 * `RegisterDataWords`, and a data type added without its word is a type error
 * here.
 */
export const wordOf = (
  words: RegisterDataWords | undefined,
  dataType: DataType | undefined
): RegisterDataWords[keyof RegisterDataWords] | undefined => {
  if (words === undefined || dataType === undefined) return undefined
  if (dataType === 'none' || dataType === 'bitmap') return undefined
  return words[dataType]
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
   * the transaction log read it, so the Addr cell was blank for every coil read,
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

/**
 * How long a poll waits before the next read of a device that has left
 * `silentPolls` polls in a row unanswered.
 *
 * The poll rate, until the device is offline. From then on each silent poll
 * doubles the wait, up to `maxPollInterval`, because on a shared bus every poll
 * of a device that is not there costs every other device on it a full timeout.
 */
export const pollDelay = (
  { pollRate, offlineAfterTimeouts, maxPollInterval }: RegisterConfig,
  silentPolls: number
): number => {
  if (silentPolls < offlineAfterTimeouts) return pollRate
  const doublings = silentPolls - offlineAfterTimeouts + 1
  return Math.min(pollRate * 2 ** doublings, Math.max(maxPollInterval, pollRate))
}

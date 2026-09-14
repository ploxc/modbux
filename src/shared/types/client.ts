import z from 'zod'
import { BaseDataTypeSchema, DataTypeSchema } from './datatype'
import { BitMapConfigSchema } from './bitmap'
import { PortSchema, RegisterAddressSchema, UnitIdSchema } from './ranges'
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

export const RegisterMapObjectSchema = z.record(
  z.string().refine((v) => !isNaN(Number(v)), {
    message: 'Key must be a number string'
  }),
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
  unitId: z.number(),
  address: z.number(),
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
export type ConnectionConfigTcp = z.infer<typeof ConnectionConfigTcpSchema>

export const ConnectionConfigRtuSchema = z.object({
  com: z.string(),
  options: SerialPortOptionsSchema
})
export type ConnectionConfigRtu = z.infer<typeof ConnectionConfigRtuSchema>

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
        value: z.array(z.boolean()),
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
export type ConnectState = z.infer<typeof ConnectStateSchema>

export const ClientStateSchema = z.object({
  connectState: ConnectStateSchema,
  polling: z.boolean(),
  scanningUnitIds: z.boolean(),
  scanningRegisters: z.boolean()
})
export type ClientState = z.infer<typeof ClientStateSchema>

//
//
// Register config

export const RegisterConfigSchema = z.object({
  address: z.number(),
  length: z.number(),
  type: RegisterTypeSchema,
  pollRate: z.number(),
  timeout: z.number(),
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
  nextDataAddress: number
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

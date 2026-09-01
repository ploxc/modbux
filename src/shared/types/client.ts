import z from 'zod'
import { BaseDataTypeSchema, DataTypeSchema } from './datatype'
import { BitMapConfigSchema } from './bitmap'
import { BooleanRegisters, NumberRegisters, UnitIdString } from './server'

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
})
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

export const ModbusBaudRateSchema = z.enum([
  '1200',
  '2400',
  '4800',
  '9600',
  '14400',
  '19200',
  '38400',
  '57600',
  '115200'
])
export type ModbusBaudRate = z.infer<typeof ModbusBaudRateSchema>

// modbus-serial TcpPortOptions partial
export const TcpPortOptionsSchema = z.object({
  port: z.number(),
  timeout: z.number()
})
export type TcpPortOptions = z.infer<typeof TcpPortOptionsSchema>

export const SerialPortOptionsSchema = z.object({
  baudRate: ModbusBaudRateSchema,
  dataBits: z.number(),
  stopBits: z.number(),
  parity: z.enum(['none', 'even', 'odd', 'mark', 'space']).optional()
})
export type SerialPortOptions = z.infer<typeof SerialPortOptionsSchema>

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

export const ConnectionConfigSchema = z.object({
  protocol: ProtocolSchema,
  unitId: z.number(),
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
    address: z.number().int().min(0).max(65535),
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
  scanningUniId: z.boolean(),
  scanningRegisters: z.boolean()
})
export type ClientState = z.infer<typeof ClientStateSchema>

//
//
// Register config
export const RegisterTypeSchema = z.enum([
  'coils',
  'discrete_inputs',
  'input_registers',
  'holding_registers'
])
export type RegisterType = z.infer<typeof RegisterTypeSchema>

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

export interface RegisterValue {
  uuid: string
  unitId: UnitIdString
  registerType: NumberRegisters
  address: number
  raw: number
}

export interface BooleanValue {
  uuid: string
  unitId: UnitIdString
  registerType: BooleanRegisters
  address: number
  value: boolean
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

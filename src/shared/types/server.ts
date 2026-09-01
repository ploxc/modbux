import { z } from 'zod'
import { BaseDataTypeSchema } from './datatype'
import { BitMapConfigSchema } from './bitmap'
import { RegisterType, SerialPortOptionsSchema } from './client'
import { PortSchema, RegisterAddressSchema } from './ranges'
import { unitIds } from './unitid'

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
  uuid: z.string().min(1),
  serialConfig: ServerSerialConfigSchema
})
export type StartRtuServerParams = z.infer<typeof StartRtuServerParamsSchema>

// Zod schema for boolean register types
export const BooleanRegistersSchema = z.enum(['coils', 'discrete_inputs'])
export type BooleanRegisters = z.infer<typeof BooleanRegistersSchema>

// Zod schema for number register types
export const NumberRegistersSchema = z.enum(['input_registers', 'holding_registers'])
export type NumberRegisters = z.infer<typeof NumberRegistersSchema>

// Zod schema for unit ids
export const UnitIdStringSchema = z.enum(unitIds)
export type UnitIdString = z.infer<typeof UnitIdStringSchema>

// Parameter schema for dynamic or static values
const RegisterParamsGeneratorPartSchema = z.object({
  min: z.number(),
  max: z.number(),
  interval: z.number(),
  value: z.undefined() // Explicitly forbid 'value'
})
export type RegisterParamsGeneratorPart = z.infer<typeof RegisterParamsGeneratorPartSchema>

const RegisterParamsStaticPartSchema = z.object({
  value: z.number(),
  min: z.undefined(),
  max: z.undefined(),
  interval: z.undefined()
})
export type RegisterParamsStaticPart = z.infer<typeof RegisterParamsStaticPartSchema>

// Base fields shared by both variants
export const RegisterParamsBasePartSchema = z.object({
  address: z.number(),
  registerType: NumberRegistersSchema,
  dataType: BaseDataTypeSchema,
  comment: z.string(),
  length: z.number().optional(),
  stringValue: z.string().optional(),
  bitMap: BitMapConfigSchema.optional()
})
export type RegisterParamsBasePart = z.infer<typeof RegisterParamsBasePartSchema>

// Final RegisterValueParameters schema with conditional fields
export const RegisterParamsSchema = RegisterParamsBasePartSchema.and(
  z.union([RegisterParamsGeneratorPartSchema, RegisterParamsStaticPartSchema])
)
export type RegisterParams = z.infer<typeof RegisterParamsSchema>

// Schema for a single boolean entry with optional comment
export const ServerBoolEntrySchema = z.object({
  value: z.boolean(),
  comment: z.string().optional()
})
export type ServerBoolEntry = z.infer<typeof ServerBoolEntrySchema>

// Schema for a boolean dictionary keyed by numeric strings
export const ServerBoolSchema = z.record(z.string().regex(/^\d+$/), ServerBoolEntrySchema)
export type ServerBool = z.infer<typeof ServerBoolSchema>

// Schema for a single register entry
export const ServerRegisterEntrySchema = z.object({
  value: z.number(),
  params: RegisterParamsSchema
})
export type ServerRegisterEntry = z.infer<typeof ServerRegisterEntrySchema>

// Schema for a dictionary of register entries keyed by numeric strings
export const ServerRegisterSchema = z.record(z.string().regex(/^\d+$/), ServerRegisterEntrySchema)
export type ServerRegister = z.infer<typeof ServerRegisterSchema>

// Schema representing all register types for a server
export const ServerRegistersSchema: z.ZodType<{
  [key in RegisterType]: key extends 'coils' | 'discrete_inputs' ? ServerBool : ServerRegister
}> = z.object({
  coils: ServerBoolSchema,
  discrete_inputs: ServerBoolSchema,
  input_registers: ServerRegisterSchema,
  holding_registers: ServerRegisterSchema
})
export type ServerRegisters = z.infer<typeof ServerRegistersSchema>

export const ServerRegistersPerUnitSchema = z.record(
  UnitIdStringSchema,
  z.union([ServerRegistersSchema, z.undefined()])
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
  uuid: z.string().min(1),
  unitId: UnitIdStringSchema,
  params: RegisterParamsSchema,
  littleEndian: z.boolean()
})
export type AddRegisterParams = z.infer<typeof AddRegisterParamsSchema>
export const RemoveRegisterParamsSchema = z.object({
  uuid: z.string().min(1),
  unitId: UnitIdStringSchema,
  registerType: NumberRegistersSchema,
  address: RegisterAddressSchema,
  dataType: BaseDataTypeSchema
})
export type RemoveRegisterParams = z.infer<typeof RemoveRegisterParamsSchema>

export const SyncRegisterValueParamsSchema = z.object({
  uuid: z.string().min(1),
  unitId: UnitIdStringSchema,
  registerValues: z.array(RegisterParamsSchema),
  littleEndian: z.boolean()
})
export type SyncRegisterValueParams = z.infer<typeof SyncRegisterValueParamsSchema>

export const ResetRegistersParamsSchema = z.object({
  uuid: z.string().min(1),
  unitId: UnitIdStringSchema,
  registerType: NumberRegistersSchema
})
export type ResetRegistersParams = z.infer<typeof ResetRegistersParamsSchema>

export const SetBooleanParametersSchema = z.object({
  uuid: z.string().min(1),
  unitId: UnitIdStringSchema,
  registerType: BooleanRegistersSchema,
  address: z.number().int().min(0).max(65535),
  state: z.boolean()
})
export type SetBooleanParameters = z.infer<typeof SetBooleanParametersSchema>

export const ResetBoolsParamsSchema = z.object({
  uuid: z.string().min(1),
  unitId: UnitIdStringSchema,
  registerType: BooleanRegistersSchema
})
export type ResetBoolsParams = z.infer<typeof ResetBoolsParamsSchema>

export const SyncBoolsParametersSchema = z.object({
  uuid: z.string().min(1),
  unitId: UnitIdStringSchema,
  coils: z.array(z.boolean()),
  discrete_inputs: z.array(z.boolean())
})
export type SyncBoolsParameters = z.infer<typeof SyncBoolsParametersSchema>

export const CreateServerParamsSchema = z.object({
  uuid: z.string().min(1),
  port: PortSchema
})
export type CreateServerParams = z.infer<typeof CreateServerParamsSchema>

export interface SetUnitIdParams {
  uuid: string
  unitID: UnitIdString
}

export interface ServerData {
  coils: boolean[]
  discrete_inputs: boolean[]
  input_registers: number[]
  holding_registers: number[]
}

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

export interface ValueGenerators {
  input_registers: Map<number, RegisterValueGenerator>
  holding_registers: Map<number, RegisterValueGenerator>
}

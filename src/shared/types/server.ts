import { z } from 'zod'
import { BaseDataTypeSchema } from './datatype'
import { RegisterType } from './client'
import { ValueGenerator } from 'src/main/modules/modbusServer/valueGenerator'
import { unitIds } from './unitid'

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
  littleEndian: z.boolean(),
  comment: z.string()
})
export type RegisterParamsBasePart = z.infer<typeof RegisterParamsBasePartSchema>

// Final RegisterValueParameters schema with conditional fields
export const RegisterParamsSchema = RegisterParamsBasePartSchema.and(
  z.union([RegisterParamsGeneratorPartSchema, RegisterParamsStaticPartSchema])
)
export type RegisterParams = z.infer<typeof RegisterParamsSchema>

// Schema for a boolean dictionary keyed by numeric strings
export const ServerBoolSchema = z.record(z.string().regex(/^\d+$/), z.boolean())
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

// Final server config schema
export const ServerConfigSchema = z.object({
  name: z.string(),
  serverRegistersPerUnit: z.record(UnitIdStringSchema, ServerRegistersSchema)
})
export type ServerConfig = z.infer<typeof ServerConfigSchema>

//
//
//
//
//
//

// Regular types
export type AddRegisterParams = {
  uuid: string
  unitId: UnitIdString
  params: RegisterParams
}
export interface RemoveRegisterParams {
  uuid: string
  unitId: UnitIdString
  registerType: NumberRegisters
  address: number
}

export interface SyncRegisterValueParams {
  uuid: string
  unitId: UnitIdString
  registerValues: RegisterParams[]
}

export interface ResetRegistersParams {
  uuid: string
  unitId: UnitIdString
  registerType: NumberRegisters
}

export interface SetBooleanParameters {
  uuid: string
  unitId: UnitIdString
  registerType: BooleanRegisters
  address: number
  state: boolean
}

export interface ResetBoolsParams {
  uuid: string
  unitId: UnitIdString
  registerType: BooleanRegisters
}

export interface SyncBoolsParameters {
  uuid: string
  unitId: UnitIdString
  coils: boolean[]
  discrete_inputs: boolean[]
}

export interface CreateServerParams {
  uuid: string
  port: number
}

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

export interface ValueGenerators {
  input_registers: Map<number, ValueGenerator>
  holding_registers: Map<number, ValueGenerator>
}

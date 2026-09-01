import { RegisterTypeSchema } from './client'
import { RegisterAddressSchema, UnitIdSchema } from './ranges'
import { z } from 'zod'

// Scan Registers
export const ScanRegistersParametersSchema = z.object({
  addressRange: z.tuple([RegisterAddressSchema, RegisterAddressSchema]),
  length: z.number().int().positive(),
  timeout: z.number().int().positive()
})
export type ScanRegistersParameters = z.infer<typeof ScanRegistersParametersSchema>

//
//
// Scan Unit ID parameters
export const ScanUnitIDParametersSchema = z.object({
  range: z.tuple([UnitIdSchema, UnitIdSchema]),
  address: RegisterAddressSchema,
  length: z.number().int().positive(),
  registerTypes: z.array(RegisterTypeSchema).min(1),
  timeout: z.number().int().positive()
})
export type ScanUnitIDParameters = z.infer<typeof ScanUnitIDParametersSchema>

const ScanUnitIdErrorMessageSchema = z.object({
  coils: z.string(),
  discrete_inputs: z.string(),
  input_registers: z.string(),
  holding_registers: z.string()
})

export const ScanUnitIDResultSchema = z.object({
  id: z.number(),
  /** Answered with data. */
  registerTypes: z.array(RegisterTypeSchema),
  /**
   * Answered with a Modbus exception. A refusal is still an answer: the unit
   * is there and talking, which is the opposite of the silence a unit ID that
   * is not on the bus gives back.
   */
  refusedRegisterTypes: z.array(RegisterTypeSchema).default([]),
  requestedRegisterTypes: z.array(RegisterTypeSchema),
  errorMessage: ScanUnitIdErrorMessageSchema
})

export type ScanUnitIDResult = z.infer<typeof ScanUnitIDResultSchema>

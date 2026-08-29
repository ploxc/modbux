import { RegisterType, RegisterTypeSchema } from './client'
import { z } from 'zod'

// Scan Registers
export interface ScanRegistersParameters {
  addressRange: [number, number]
  length: number
  timeout: number
}

//
//
// Scan Unit ID parameters
export interface ScanUnitIDParameters {
  range: [number, number]
  address: number
  length: number
  registerTypes: RegisterType[]
  timeout: number
}

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

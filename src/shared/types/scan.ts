import { RegisterType, RegisterTypeSchema } from './register'
import { maxReadQuantity, RegisterAddressSchema, UnitIdSchema } from './ranges'
import z from 'zod'

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
/**
 * What a unit id scan asks each unit for.
 *
 * `length` and `registerTypes` bound each other, so the rule is the pair: one
 * length goes out for every type selected, and the strictest of them is the one
 * the request has to fit. Bare, `length` reached
 * `this._readers[registerType](address, length)` unchanged and `modbus-serial`
 * wrote it into the quantity field with nothing between.
 */
export const ScanUnitIDParametersSchema = z
  .object({
    range: z.tuple([UnitIdSchema, UnitIdSchema]),
    address: RegisterAddressSchema,
    length: z.number().int().positive(),
    registerTypes: z.array(RegisterTypeSchema).min(1),
    timeout: z.number().int().positive()
  })
  .superRefine((parameters, ctx) => {
    const ceiling = maxReadQuantity(parameters.registerTypes)
    if (parameters.length <= ceiling) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['length'],
      message: `One read of these register types answers at most ${ceiling}`
    })
  })
export type ScanUnitIDParameters = z.infer<typeof ScanUnitIDParametersSchema>

const ScanUnitIdErrorMessageSchema = z.object({
  coils: z.string(),
  discrete_inputs: z.string(),
  input_registers: z.string(),
  holding_registers: z.string()
} satisfies Record<RegisterType, z.ZodString>)

export const ScanUnitIDResultSchema = z.object({
  id: z.number(),
  /** Answered with data. */
  registerTypes: z.array(RegisterTypeSchema),
  /**
   * Answered with a Modbus exception. A refusal is still an answer: the unit
   * is there and talking, which is the opposite of the silence a unit ID that
   * is not on the bus gives back.
   */
  refusedRegisterTypes: z.array(RegisterTypeSchema),
  requestedRegisterTypes: z.array(RegisterTypeSchema),
  errorMessage: ScanUnitIdErrorMessageSchema
})

export type ScanUnitIDResult = z.infer<typeof ScanUnitIDResultSchema>

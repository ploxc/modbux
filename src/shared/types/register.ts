import z from 'zod'

// Zod schema for boolean register types
export const BooleanRegistersSchema = z.enum(['coils', 'discrete_inputs'])
export type BooleanRegisters = z.infer<typeof BooleanRegistersSchema>

// Zod schema for number register types
export const NumberRegistersSchema = z.enum(['input_registers', 'holding_registers'])
export type NumberRegisters = z.infer<typeof NumberRegistersSchema>

export const RegisterTypeSchema = z.enum([
  ...NumberRegistersSchema.options,
  ...BooleanRegistersSchema.options
])
export type RegisterType = z.infer<typeof RegisterTypeSchema>

const NUMBER_REGISTERS = new Set<string>(NumberRegistersSchema.options)
const BOOLEAN_REGISTERS = new Set<string>(BooleanRegistersSchema.options)

/**
 * Whether `type` is one of the two register types holding 16 bit words.
 *
 * The pair was written out at five sites and the bool pair at two, and a
 * hand-written membership test does not grow when the enum does. Both read
 * `.options`, which is why the enums are here.
 */
export const isNumberRegister = (type: string): type is NumberRegisters =>
  NUMBER_REGISTERS.has(type)

/** Whether `type` is one of the two register types holding single bits. */
export const isBooleanRegister = (type: string): type is BooleanRegisters =>
  BOOLEAN_REGISTERS.has(type)

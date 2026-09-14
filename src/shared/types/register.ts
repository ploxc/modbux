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

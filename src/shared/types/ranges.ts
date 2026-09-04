import { z } from 'zod'

/**
 * Ranges the protocol and the socket fix, so a schema states them once.
 *
 * A register address is 16 bit, so 0 to 65535. A unit id is one byte: 0 is the
 * broadcast address and 248 through 255 are reserved, but a field device answers
 * on whatever its vendor put there, so the byte is the range and the reserved
 * part is not refused here. A TCP port is also 16 bit, and shares no meaning
 * with a register address beyond the width.
 */
export const RegisterAddressSchema = z.number().int().min(0).max(65535)
export const UnitIdSchema = z.number().int().min(0).max(255)
export const PortSchema = z.number().int().min(0).max(65535)

/**
 * The same range for a register map keyed by address.
 *
 * A JSON object key is a string, so the range has to be checked after the
 * conversion. Digits only already gives an integer at or above zero, which
 * leaves the ceiling.
 */
export const RegisterAddressKeySchema = z
  .string()
  .regex(/^\d+$/)
  .refine((key) => Number(key) <= 65535, { message: 'Number must be less than or equal to 65535' })

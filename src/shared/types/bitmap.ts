import z from 'zod'

export const BitColorSchema = z.enum(['default', 'warning', 'error'])
export type BitColor = z.infer<typeof BitColorSchema>

/** One entry per bit (index 0–15). */
export const BitMapEntrySchema = z.object({
  comment: z.string().optional(),
  color: BitColorSchema.optional(),
  invert: z.boolean().optional()
})

/**
 * Record keyed by bit-index string ("0" to "15").
 *
 * The key was `!isNaN(Number(v))` refined to the range, the shape
 * `RegisterAddressKeySchema` was rewritten away from: `Number` takes spellings
 * that are not decimal digits, and `ServerBitMapDetail` and `BitMapDetailPanel`
 * both write and read this key as `String(bitIndex)`. `schemas.test.ts` names
 * the seven that got in.
 */
export const BitMapConfigSchema = z.record(
  z.string().regex(/^(?:[0-9]|1[0-5])$/),
  BitMapEntrySchema.optional()
)
export type BitMapConfig = z.infer<typeof BitMapConfigSchema>

export const BITMAP_DATATYPE = 'bitmap' as const

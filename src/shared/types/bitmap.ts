import { z } from 'zod'

// ─── Merge TODO ──────────────────────────────────────────────────────────────
// In client.ts → import { BitMapConfigSchema } from './bitmap'
//                and add:  bitMap: BitMapConfigSchema.optional()
//                to RegisterMapValueSchema
// ('bitmap' is already in BaseDataTypeSchema)
// ─────────────────────────────────────────────────────────────────────────────

/** One entry per bit (index 0–15). */
export const BitMapEntrySchema = z.object({
  comment: z.string().optional()
})
export type BitMapEntry = z.infer<typeof BitMapEntrySchema>

/** Record keyed by bit-index string ("0" – "15"). */
export const BitMapConfigSchema = z.record(
  z.string().refine((v) => {
    const n = Number(v)
    return !isNaN(n) && n >= 0 && n <= 15
  }),
  BitMapEntrySchema.optional()
)
export type BitMapConfig = z.infer<typeof BitMapConfigSchema>

export const BITMAP_DATATYPE = 'bitmap' as const

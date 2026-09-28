import z from 'zod'

/**
 * How a register's value is converted after its data type reads it: a
 * factor, a linear interpolation from two raw points to two values, or a
 * script that takes `raw` and returns the value.
 */
export const ConversionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scale'), factor: z.number() }),
  z.object({
    kind: z.literal('lerp'),
    x1: z.string(),
    x2: z.string(),
    y1: z.string(),
    y2: z.string()
  }),
  z.object({ kind: z.literal('script'), code: z.string() })
])
export type Conversion = z.infer<typeof ConversionSchema>
export type ConversionKind = Conversion['kind']

/** The script a new Custom conversion starts from: the value as read. */
export const DEFAULT_SCRIPT = 'return raw'

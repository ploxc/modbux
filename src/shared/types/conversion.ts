import z from 'zod'

/**
 * A point of a linear interpolation: a decimal number, an exponent included,
 * which is every form the dialog saves. `Number` would read `0x10` as 16 where
 * the dialog's field takes the decimal form only, so any other form is refused.
 */
const LerpPointSchema = z.string().regex(/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i)

/**
 * How a register's value is converted after its data type reads it: a
 * factor, a linear interpolation from two raw points to two values, or a
 * script that takes `raw` and returns the value.
 */
export const ConversionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scale'), factor: z.number() }),
  z.object({
    kind: z.literal('lerp'),
    x1: LerpPointSchema,
    x2: LerpPointSchema,
    y1: LerpPointSchema,
    y2: LerpPointSchema
  }),
  z.object({ kind: z.literal('script'), code: z.string() })
])
export type Conversion = z.infer<typeof ConversionSchema>
export type ConversionKind = Conversion['kind']

/** The script a new Custom conversion starts from: the value as read. */
export const DEFAULT_SCRIPT = 'return raw'

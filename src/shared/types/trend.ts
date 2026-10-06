import z from 'zod'
import { RegisterTypeSchema } from './register'

/** How far back a trend reaches: 10 minutes, an hour, 8 hours, or the whole log. */
const TrendRangeIdSchema = z.enum(['10m', '1h', '8h', 'log'])
export type TrendRangeId = z.infer<typeof TrendRangeIdSchema>

/** A range an axis is held at, rather than fitting what it draws. */
const AxisRangeSchema = z.object({ min: z.number(), max: z.number() })
export type AxisRange = z.infer<typeof AxisRangeSchema>

/**
 * How a trend draws: a fixed range per engineering unit, keyed by the unit
 * and none for a unit whose axis fits what it draws; a plot's height in
 * pixels per engineering unit, and none for a plot sharing the free room; the
 * time axis as the clock reads it or as the time since the trend's start; and
 * its lines as lines, steps or points.
 */
const TrendSettingsSchema = z.object({
  axes: z.record(z.string(), AxisRangeSchema).optional(),
  heights: z.record(z.string(), z.number().int().positive()).optional(),
  time: z.enum(['clock', 'since']),
  drawAs: z.enum(['lines', 'steps', 'points'])
})
export type TrendSettings = z.infer<typeof TrendSettingsSchema>

/** A register a saved trend draws, of one of its client's units, in its colour, and whether it is hidden. */
const SavedTrendEntrySchema = z.object({
  unit: z.string(),
  type: RegisterTypeSchema,
  address: z.number().int().min(0),
  color: z.string(),
  hidden: z.boolean().optional()
})

/** A trend kept under a name with its client: its registers, its range and how it draws. */
export const SavedTrendSchema = z.object({
  name: z.string().min(1),
  entries: z.array(SavedTrendEntrySchema),
  range: TrendRangeIdSchema,
  settings: TrendSettingsSchema
})
export type SavedTrend = z.infer<typeof SavedTrendSchema>

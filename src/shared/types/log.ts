import z from 'zod'
import { RegisterTypeSchema } from './register'

/**
 * How a register logs: a sample on every poll, or one only when the value
 * moves further than `deadband` from the last sample kept. The deadband is in
 * the value the data type decodes, before the conversion, because that is the
 * value the log holds.
 */
export const LogSettingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('poll') }),
  z.object({ mode: z.literal('change'), deadband: z.number().nonnegative() })
])
export type LogSetting = z.infer<typeof LogSettingSchema>

/** How many samples a client's log holds before the oldest is overwritten. */
export const DEFAULT_LOG_CAPACITY = 1_000_000

/** Why a run of the log ended, which the chart shows at the gap after it. */
const LogStopReasonSchema = z.enum(['log stopped', 'poll stopped', 'disconnected'])
export type LogStopReason = z.infer<typeof LogStopReasonSchema>

/** One stretch of the log between a start and a stop. */
const LogRunSchema = z.object({
  start: z.number(),
  end: z.number().optional(),
  reason: LogStopReasonSchema.optional()
})
export type LogRun = z.infer<typeof LogRunSchema>

/** What a client's log holds, whether logging is on, and whether it takes samples. */
export const LogStatusSchema = z.object({
  /** Logging is switched on; it takes samples while the client also polls. */
  enabled: z.boolean(),
  running: z.boolean(),
  samples: z.number(),
  capacity: z.number(),
  /** How many samples were overwritten, since the log was last cleared. */
  overwritten: z.number(),
  /** The time of the oldest sample still held. */
  oldest: z.number().optional(),
  runs: z.array(LogRunSchema)
})
export type LogStatus = z.infer<typeof LogStatusSchema>

export const emptyLogStatus = (): LogStatus => ({
  enabled: false,
  running: false,
  samples: 0,
  capacity: DEFAULT_LOG_CAPACITY,
  overwritten: 0,
  runs: []
})

/** Where a sample came from: one register of one unit. */
export const LogSeriesSchema = z.object({
  unit: z.string(),
  type: RegisterTypeSchema,
  address: z.number().int().min(0)
})
export type LogSeries = z.infer<typeof LogSeriesSchema>

/**
 * One sample as the log hands it back: the value the data type decodes, and
 * the error of a read that failed, whose value is NaN.
 */
export interface LogSample extends LogSeries {
  time: number
  value: number
  error: string | undefined
}

/** A page of the log, and the sequence to ask from next, none once it is read to its end. */
export interface LogPage {
  samples: LogSample[]
  next: number | undefined
}

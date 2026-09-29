import z from 'zod'

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
export type LogStopReason = 'log stopped' | 'poll stopped' | 'disconnected'

/** One stretch of the log between a start and a stop. */
export interface LogRun {
  start: number
  end?: number
  reason?: LogStopReason
}

/** What a client's log holds and whether it is taking samples. */
export interface LogStatus {
  running: boolean
  samples: number
  capacity: number
  /** How many samples were overwritten, since the log was last started new. */
  overwritten: number
  /** The time of the oldest sample still held. */
  oldest: number | undefined
  runs: LogRun[]
}

import z from 'zod'

/**
 * How every client meets a device or a connection that does not answer: how
 * often and how long it tries to reconnect after a dropped connection, and
 * how far apart the polls of a unit that stopped answering get. Set for the
 * whole app, in Settings.
 */
export const ConnectionSettingsSchema = z.object({
  /** Attempts after a dropped connection before a client gives up; 0 keeps trying. */
  reconnectAttempts: z.number().int().min(0).max(100),
  /** The wait before the first attempt, in milliseconds; each attempt after waits twice as long. */
  reconnectFirstWait: z.number().int().min(500).max(60_000),
  /** Where the wait stops growing, in milliseconds. */
  reconnectLongestWait: z.number().int().min(1000).max(3_600_000),
  /** Keep trying for as long as a client riding the connection logs, whatever the attempts say. */
  reconnectWhileLogging: z.boolean(),
  /** How many polls in a row a unit may leave unanswered before it is offline. */
  offlineAfterTimeouts: z.number().int().min(1).max(100),
  /** How far apart, in milliseconds, the polls of an offline unit may get. */
  maxPollInterval: z.number().int().min(1000).max(3_600_000)
})
export type ConnectionSettings = z.infer<typeof ConnectionSettingsSchema>

export const defaultConnectionSettings: ConnectionSettings = {
  reconnectAttempts: 5,
  reconnectFirstWait: 3000,
  reconnectLongestWait: 60_000,
  reconnectWhileLogging: true,
  offlineAfterTimeouts: 3,
  maxPollInterval: 60_000
}

/** How long the reconnect `attempt`, counted from 1, waits before it opens. */
export const reconnectWait = (
  { reconnectFirstWait, reconnectLongestWait }: ConnectionSettings,
  attempt: number
): number =>
  Math.min(
    reconnectFirstWait * 2 ** (attempt - 1),
    Math.max(reconnectLongestWait, reconnectFirstWait)
  )

/**
 * Whether a burst that made `attemptsMade` attempts makes one more: while a
 * client riding the connection logs and that is set to keep trying, while the
 * attempts are 0, or until they are made.
 */
export const keepsReconnecting = (
  { reconnectAttempts, reconnectWhileLogging }: ConnectionSettings,
  attemptsMade: number,
  logging: boolean
): boolean =>
  (logging && reconnectWhileLogging) || reconnectAttempts === 0 || attemptsMade < reconnectAttempts

/**
 * How long a poll waits before the next read of a unit that has left
 * `silentPolls` polls in a row unanswered.
 *
 * The poll rate, until the unit is offline. From then on each silent poll
 * doubles the wait, up to `maxPollInterval`, because on a shared bus every poll
 * of a unit that is not there costs every other unit on it a full timeout.
 */
export const pollDelay = (
  pollRate: number,
  { offlineAfterTimeouts, maxPollInterval }: ConnectionSettings,
  silentPolls: number
): number => {
  if (silentPolls < offlineAfterTimeouts) return pollRate
  const doublings = silentPolls - offlineAfterTimeouts + 1
  return Math.min(pollRate * 2 ** doublings, Math.max(maxPollInterval, pollRate))
}

import { DateTime } from 'luxon'

/** A count as the log's status writes it: 3,412. */
export const formatCount = (count: number): string => count.toLocaleString('en-US')

/** A sample's time as the log's texts write it. */
export const formatTime = (millis: number | undefined): string =>
  millis === undefined ? '' : DateTime.fromMillis(millis).toFormat('HH:mm:ss')

/** How long a run has lasted, as hh:mm:ss. */
export const formatDuration = (millis: number): string => {
  const seconds = Math.max(0, Math.floor(millis / 1000))
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
  return parts.map((part) => String(part).padStart(2, '0')).join(':')
}

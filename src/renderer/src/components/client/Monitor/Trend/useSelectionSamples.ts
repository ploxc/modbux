import { LogPoint } from '@shared'
import { useEffect, useState } from 'react'
import { TrendEntry, trendKey, TrendStretch } from './trendPanel.zustand'

/** How many samples one request asks main for, as the log export asks. */
const PAGE = 20_000

/**
 * Every sample of each register in `entries` from `stretch.from` to
 * `stretch.to`, from main's log rather than the stepped points a plot draws,
 * by `trendKey`, paged as the log export pages. It stops asking once
 * `cancelled` answers true between two pages.
 */
export const logSamples = async (
  uuid: string,
  entries: TrendEntry[],
  stretch: TrendStretch,
  cancelled: () => boolean
): Promise<Record<string, LogPoint[]>> => {
  const series = entries.map(({ unit, type, address }) => ({ unit, type, address }))
  const points: Record<string, LogPoint[]> = {}
  let after: number | undefined = 0
  while (after !== undefined) {
    const page = await window.api.getLogPage({
      uuid,
      after,
      limit: PAGE,
      from: stretch.from,
      to: stretch.to,
      series
    })
    if (cancelled() || page === undefined) break
    for (const { unit, type, address, time, value, error } of page.samples)
      (points[trendKey({ uuid, unit, type, address })] ??= []).push({ time, value, error })
    after = page.next
  }
  return points
}

/**
 * `logSamples` of a stretch, asked again when the stretch or the registers
 * change, and an answer to a question asked before that is dropped. None
 * until the first answer for the stretch; while the registers change it
 * keeps the last answer for the same stretch.
 */
export const useSelectionSamples = (
  uuid: string,
  entries: TrendEntry[],
  stretch: TrendStretch | undefined
): Record<string, LogPoint[]> | undefined => {
  const [answered, setAnswered] = useState<{
    stretch: TrendStretch
    points: Record<string, LogPoint[]>
  }>()

  useEffect(() => {
    if (stretch === undefined) return
    let cancelled = false
    void logSamples(uuid, entries, stretch, () => cancelled).then((points) => {
      if (!cancelled) setAnswered({ stretch, points })
    })
    return (): void => {
      cancelled = true
    }
  }, [uuid, entries, stretch])

  return answered !== undefined && answered.stretch === stretch ? answered.points : undefined
}

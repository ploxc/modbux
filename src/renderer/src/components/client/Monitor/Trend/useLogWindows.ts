import { LogPoint } from '@shared'
import { useEffect, useState } from 'react'
import { TREND_WINDOW_MS } from './trendData'
import { TrendEntry, trendKey } from './trendPanel.zustand'

/** How often a trend that moves live asks main for what came in since. */
const LIVE_MS = 1000

/**
 * The samples of each register in `entries` over the `TREND_WINDOW_MS` up to
 * `until`, from main's log, by `trendKey`; up to now while `live`. Live, it
 * asks again every second for what came after each last answer, the next
 * round only once the last has answered, and drops what fell out of the
 * window.
 */
export const useLogWindows = (
  entries: TrendEntry[],
  live: boolean,
  until: number | undefined
): Record<string, LogPoint[]> => {
  const [points, setPoints] = useState<Record<string, LogPoint[]>>({})

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const ends = new Map<string, number>()
    const held = new Map<string, LogPoint[]>()

    const ask = async (): Promise<void> => {
      const from = (live ? Date.now() : (until ?? Date.now())) - TREND_WINDOW_MS
      for (const entry of entries) {
        const key = trendKey(entry)
        const answer = await window.api.getLogWindow({
          uuid: entry.uuid,
          series: { unit: entry.unit, type: entry.type, address: entry.address },
          from,
          after: ends.get(key) ?? 0
        })
        if (cancelled) return
        if (answer === undefined) continue
        ends.set(key, answer.end)
        const kept = [...(held.get(key) ?? []), ...answer.points]
        held.set(
          key,
          kept.filter((point) => point.time >= from)
        )
      }
      setPoints(Object.fromEntries(held))
      if (live) timer = setTimeout(() => void ask(), LIVE_MS)
    }
    void ask()

    return (): void => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [entries, live, until])

  return points
}

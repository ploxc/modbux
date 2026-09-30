import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { LogPoint } from '@shared'
import { useEffect, useState } from 'react'
import { mergeSteps, stepOf } from './trendData'
import { TrendEntry, trendKey } from './trendPanel.zustand'

/** How often a trend that moves live asks main for what came in since. */
const LIVE_MS = 1000

/**
 * What a trend draws: `span` up to now while `live`, and up to `until`
 * otherwise, in `steps` stretches when it says. `started` says the log's
 * oldest sample is known, which a window with no bound starts at.
 */
export interface TrendWindow {
  live: boolean
  span: number
  until: number | undefined
  started: boolean
  steps?: number
}

/**
 * Where a window of the log starts: `span` before its end, and never before
 * the log's oldest sample, which is where a window with no bound starts. With
 * no oldest sample known, one with no bound has nowhere to start.
 */
export const windowStart = (
  to: number,
  span: number,
  oldest: number | undefined
): number | undefined => (Number.isFinite(span) ? Math.max(to - span, oldest ?? to - span) : oldest)

/**
 * The samples of each register in `entries` over the window, from main's log,
 * by `trendKey`, in main's steps for the window's length. Live, it asks again
 * every second for what came after each last answer, the next round only once
 * the last has answered; merges the stretch each answer goes on; and drops
 * what fell out of the window.
 */
export const useLogWindows = (
  entries: TrendEntry[],
  { live, span, until, started, steps }: TrendWindow
): Record<string, LogPoint[]> => {
  const [points, setPoints] = useState<Record<string, LogPoint[]>>({})

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const ends = new Map<string, number>()
    const held = new Map<string, LogPoint[]>()
    const stepOfEntry = new Map<string, number | undefined>()

    const ask = async (): Promise<void> => {
      const to = live ? Date.now() : (until ?? Date.now())
      for (const entry of entries) {
        const oldest = dataOf(useLiveZustand.getState(), entry.uuid).clientState.log.oldest
        const from = windowStart(to, span, oldest)
        if (from === undefined) continue
        const key = trendKey(entry)
        // A range steps across its span, whatever the log holds of it, and
        // keeps that step, so each answer's stretches line up with the last
        // one's. The whole log steps across what it holds, which grows: once
        // it wants twice its step, it is asked again from its start.
        const wanted = stepOf(Number.isFinite(span) ? to - span : from, to, steps)
        const heldStep = stepOfEntry.get(key)
        const outgrown = wanted !== undefined && (heldStep === undefined || wanted > 2 * heldStep)
        if (!stepOfEntry.has(key) || outgrown) {
          stepOfEntry.set(key, wanted)
          ends.delete(key)
          held.delete(key)
        }
        const step = stepOfEntry.get(key)
        const answer = await window.api.getLogWindow({
          uuid: entry.uuid,
          series: { unit: entry.unit, type: entry.type, address: entry.address },
          from,
          to: live ? undefined : to,
          after: ends.get(key) ?? 0,
          step
        })
        if (cancelled) return
        if (answer === undefined) continue
        ends.set(key, answer.end)
        const kept = mergeSteps(held.get(key) ?? [], answer.points, step)
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
  }, [entries, live, span, until, started, steps])

  return points
}

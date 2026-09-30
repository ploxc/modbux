import { TREND_COLORS } from '@renderer/theme'
import { RegisterType } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { TrendRangeId, TrendView } from './trendData'

/** One register a trend draws, of a client's unit. */
export interface TrendEntry {
  uuid: string
  unit: string
  type: RegisterType
  address: number
}

/** A register the trend draws, and the colour it keeps while it is drawn. */
export interface DrawnEntry extends TrendEntry {
  color: string
}

export const trendKey = ({ uuid, unit, type, address }: TrendEntry): string =>
  `${uuid}|${unit}|${type}|${address}`

interface TrendPanelZustand {
  /** The registers drawn, in the order they were added. */
  entries: DrawnEntry[]
  /** Where the trend opened, while it is open. */
  anchor: HTMLElement | null
  /** How far back the trend reaches. A new range follows the log again. */
  range: TrendRangeId
  setRange: (range: TrendRangeId) => void
  /** The stretch zoomed or panned to, which stops the trend following the log; none follows it. */
  view: TrendView | undefined
  setView: (view: TrendView | undefined) => void
  /**
   * Adds a register, opening the trend under `anchor` when it is closed. A
   * trend draws one client's log, so a register of another client starts it
   * over with that one. Each line takes the first of `TREND_COLORS` no other
   * line has, so a trend draws as many registers as there are colours, and
   * answers false for one more.
   */
  add: (entry: TrendEntry, anchor: HTMLElement) => boolean
  /** Takes a register out, and closes the trend with the last. */
  remove: (key: string) => void
  close: () => void
}

export const useTrendPanelZustand = create<TrendPanelZustand, [['zustand/mutative', never]]>(
  mutative((set, get) => ({
    entries: [],
    anchor: null,
    range: '10m',
    setRange: (range): void =>
      set((state) => {
        state.range = range
        state.view = undefined
      }),
    view: undefined,
    setView: (view): void =>
      set((state) => {
        state.view = view
      }),
    add: (entry, anchor): boolean => {
      const { entries } = get()
      if (entries.some((drawn) => trendKey(drawn) === trendKey(entry))) return true
      const sameClient = entries.every((drawn) => drawn.uuid === entry.uuid)
      const kept = sameClient ? entries : []
      const [color] = TREND_COLORS.filter((free) => !kept.some((drawn) => drawn.color === free))
      if (color === undefined) return false
      // A partial rather than a recipe: an element is no state to draft.
      set({
        entries: [...kept, { ...entry, color }],
        anchor: get().anchor ?? anchor,
        view: sameClient ? get().view : undefined
      })
      return true
    },
    remove: (key): void =>
      set((state) => {
        state.entries = state.entries.filter((entry) => trendKey(entry) !== key)
        if (state.entries.length > 0) return
        state.anchor = null
        state.view = undefined
      }),
    close: (): void =>
      set((state) => {
        state.entries = []
        state.anchor = null
        state.view = undefined
      })
  }))
)

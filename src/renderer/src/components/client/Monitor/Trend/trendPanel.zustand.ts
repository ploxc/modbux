import { TREND_COLORS } from '@renderer/theme'
import {
  AxisRange,
  ClientUnit,
  isLogged,
  RegisterType,
  SavedTrend,
  TrendRangeId,
  TrendSettings,
  TrendSide
} from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import {
  DEFAULT_TREND_SETTINGS,
  isFollow,
  SHORTEST_VIEW_MS,
  TREND_SPANS,
  TrendFollow,
  TrendView
} from './trendData'

/** One register a trend draws, of a client's unit. */
export interface TrendEntry {
  uuid: string
  unit: string
  type: RegisterType
  address: number
}

/**
 * A register the trend draws, the colour it keeps while it is drawn, and the
 * side it is drawn on when it is set to one rather than its engineering unit's.
 */
export interface DrawnEntry extends TrendEntry {
  color: string
  side?: TrendSide
}

export const trendKey = ({ uuid, unit, type, address }: TrendEntry): string =>
  `${uuid}|${unit}|${type}|${address}`

/** Where the trend is drawn. */
export type TrendMode = 'float' | 'dock' | 'fill'

interface TrendPanelZustand {
  /** The client whose log the trend draws. */
  uuid: string
  /** The name of the saved trend it was loaded from or saved as, until a new one starts. */
  name: string | undefined
  /** Draws a saved trend of client `uuid`: its registers, range and settings, under its name. */
  load: (uuid: string, trend: SavedTrend) => void
  /** Names the trend, as it was saved under. */
  setName: (name: string | undefined) => void
  /** Starts a trend of no registers, no name and the first settings. */
  startNew: () => void
  /** The registers drawn, in the order they were added; kept while the trend is closed. */
  entries: DrawnEntry[]
  /** Where the trend opened, while it is open. */
  anchor: HTMLElement | null
  /**
   * Monitor's grid room, while Monitor is on screen: the trend opens in its
   * corner, and it stays mounted while the grid moves between the places.
   */
  room: HTMLElement | null
  setRoom: (room: HTMLElement | null) => void
  /** Floating over Monitor, docked under its grid, or filling its room. */
  mode: TrendMode
  setMode: (mode: TrendMode) => void
  /** How far back the trend reaches. A new range follows the log again. */
  range: TrendRangeId
  setRange: (range: TrendRangeId) => void
  /**
   * The stretch zoomed or panned to, which stops the trend following the log,
   * or the length it follows the log over in place of the range's; none
   * follows the log over the range.
   */
  view: TrendView | TrendFollow | undefined
  setView: (view: TrendView | TrendFollow | undefined) => void
  /**
   * Holds the stretch the trend follows the log over, ending at `now`: the
   * range's, from `oldest` for the whole log, or the trend's own length, and a
   * second at least. A stretch already held stays as it is.
   */
  pause: (now: number, oldest: number | undefined) => void
  settings: TrendSettings
  setAxisRange: (side: TrendSide, range: AxisRange | undefined) => void
  setTime: (time: TrendSettings['time']) => void
  setDrawAs: (drawAs: TrendSettings['drawAs']) => void
  /** Draws a register on a side, or on its engineering unit's again with none. */
  setSide: (key: string, side: TrendSide | undefined) => void
  /** Gives a register another colour, and the register holding that one the first's. */
  setColor: (key: string, color: string) => void
  /**
   * Opens the trend of client `uuid` in the room, as it was left. A trend
   * draws one client's log, so another client's starts empty.
   */
  open: (uuid: string) => void
  /**
   * Adds a register, opening the trend in the room when it is closed. A
   * register of another client starts the trend over with that one. Each
   * line takes the first of `TREND_COLORS` no other line has, so a trend
   * draws as many registers as there are colours, and answers false for one
   * more.
   */
  add: (entry: TrendEntry) => boolean
  /**
   * Takes a register of the trend's client out when it draws it, and adds it
   * otherwise, with a colour as `add` gives one; false for one more than the
   * colours.
   */
  toggle: (entry: TrendEntry) => boolean
  /** Takes a register out; the trend stays open, and an empty one follows the log again. */
  remove: (key: string) => void
  /** Closes the trend, which keeps its registers for when it opens again. */
  close: () => void
  /**
   * Takes out every register that no longer logs in `units`, the trend's
   * client's, which a trend kept while it was closed can hold.
   */
  prune: (units: readonly ClientUnit[]) => void
}

export const useTrendPanelZustand = create<TrendPanelZustand, [['zustand/mutative', never]]>(
  mutative((set, get) => ({
    uuid: '',
    name: undefined,
    load: (uuid, trend): void =>
      set((state) => {
        state.uuid = uuid
        state.name = trend.name
        state.entries = trend.entries.map((entry) => ({ ...entry, uuid }))
        state.range = trend.range
        state.settings = trend.settings
        state.view = undefined
      }),
    setName: (name): void =>
      set((state) => {
        state.name = name
      }),
    startNew: (): void =>
      set((state) => {
        state.name = undefined
        state.entries = []
        state.range = '10m'
        state.settings = DEFAULT_TREND_SETTINGS
        state.view = undefined
      }),
    entries: [],
    anchor: null,
    room: null,
    // A partial rather than a recipe: an element is no state to draft.
    setRoom: (room): void => set({ room }),
    mode: 'float',
    setMode: (mode): void =>
      set((state) => {
        state.mode = mode
      }),
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
    pause: (now, oldest): void =>
      set((state) => {
        const { view } = state
        if (view !== undefined && !isFollow(view)) return
        if (view !== undefined) {
          state.view = { from: now - view.length, to: now }
          return
        }
        const span = TREND_SPANS[state.range]
        const from = Number.isFinite(span) ? now - span : (oldest ?? now - TREND_SPANS['10m'])
        state.view = { from: Math.min(from, now - SHORTEST_VIEW_MS), to: now, pressed: 'range' }
      }),
    settings: DEFAULT_TREND_SETTINGS,
    // Auto takes the key away, so the settings equal a saved trend's that never held one.
    setAxisRange: (side, range): void =>
      set((state) => {
        if (range === undefined) delete state.settings[side]
        else state.settings[side] = range
      }),
    setTime: (time): void =>
      set((state) => {
        state.settings.time = time
      }),
    setDrawAs: (drawAs): void =>
      set((state) => {
        state.settings.drawAs = drawAs
      }),
    setSide: (key, side): void =>
      set((state) => {
        for (const entry of state.entries) if (trendKey(entry) === key) entry.side = side
      }),
    setColor: (key, color): void =>
      set((state) => {
        const moving = state.entries.find((entry) => trendKey(entry) === key)
        if (moving === undefined) return
        const holder = state.entries.find((entry) => entry.color === color)
        if (holder !== undefined) holder.color = moving.color
        moving.color = color
      }),
    // Partials rather than recipes: an element is no state to draft.
    open: (uuid): void => {
      const sameClient = get().uuid === uuid
      set({
        uuid,
        name: sameClient ? get().name : undefined,
        entries: sameClient ? get().entries : [],
        anchor: get().anchor ?? get().room,
        view: sameClient ? get().view : undefined
      })
    },
    add: (entry): boolean => {
      const { entries } = get()
      if (entries.some((drawn) => trendKey(drawn) === trendKey(entry))) {
        set({ anchor: get().anchor ?? get().room })
        return true
      }
      const sameClient = get().uuid === entry.uuid
      const kept = sameClient ? entries : []
      const [color] = TREND_COLORS.filter((free) => !kept.some((drawn) => drawn.color === free))
      if (color === undefined) return false
      set({
        uuid: entry.uuid,
        name: sameClient ? get().name : undefined,
        entries: [...kept, { ...entry, color }],
        anchor: get().anchor ?? get().room,
        view: sameClient ? get().view : undefined
      })
      return true
    },
    toggle: (entry): boolean => {
      const { entries } = get()
      if (entries.some((drawn) => trendKey(drawn) === trendKey(entry))) {
        get().remove(trendKey(entry))
        return true
      }
      const [color] = TREND_COLORS.filter((free) => !entries.some((drawn) => drawn.color === free))
      if (color === undefined) return false
      set((state) => {
        state.entries.push({ ...entry, color })
      })
      return true
    },
    remove: (key): void =>
      set((state) => {
        state.entries = state.entries.filter((entry) => trendKey(entry) !== key)
        if (state.entries.length === 0) state.view = undefined
      }),
    prune: (units): void =>
      set((state) => {
        state.entries = state.entries.filter((entry) =>
          isLogged(
            entry.type,
            units.find(({ uuid }) => uuid === entry.unit)?.registerMapping[entry.type][
              entry.address
            ]
          )
        )
        // An empty trend follows the log again, as one emptied by `remove` does.
        if (state.entries.length === 0) state.view = undefined
      }),
    close: (): void =>
      set((state) => {
        state.anchor = null
        state.view = undefined
      })
  }))
)

/** The trend as it would be saved under `name`: its registers, range and settings. */
export const snapshotOf = (
  { entries, range, settings }: Pick<TrendPanelZustand, 'entries' | 'range' | 'settings'>,
  name: string
): SavedTrend => ({
  name,
  entries: entries.map(({ unit, type, address, color, side }) => ({
    unit,
    type,
    address,
    color,
    ...(side === undefined ? {} : { side })
  })),
  range,
  settings
})

import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { TrendCursor } from './TrendPlot'

interface TrendReadoutZustand {
  /** Where the cursor stands over a plot or the lanes, and none while it is over neither. */
  cursor: TrendCursor | undefined
  setCursor: (cursor: TrendCursor | undefined) => void
}

/**
 * The cursor the readout reads at, held apart from the trend's body: a live
 * trend's body draws a new stretch on every render, a plot hands its cursor
 * up again on every new stretch, and a body holding the cursor rendered
 * again for each.
 */
export const useTrendReadoutZustand = create<TrendReadoutZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    cursor: undefined,
    setCursor: (cursor): void =>
      set((state) => {
        state.cursor = cursor
      })
  }))
)

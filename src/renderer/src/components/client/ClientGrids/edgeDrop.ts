import { LayoutSide } from '@shared'
import { createContext } from 'react'

/** How far into the layout, in pixels, a drop docks along the edge. */
export const EDGE_STRIP = 40

/**
 * The edge of `rect` a drop at the point docks along, the nearest one when two
 * corners' strips overlap, or none when the point is further in.
 */
export const edgeSideOf = (
  rect: { left: number; right: number; top: number; bottom: number },
  x: number,
  y: number
): LayoutSide | undefined => {
  const reach: [LayoutSide, number][] = [
    ['left', x - rect.left],
    ['right', rect.right - x],
    ['top', y - rect.top],
    ['bottom', rect.bottom - y]
  ]
  const inside = reach.filter(([, depth]) => depth >= 0 && depth <= EDGE_STRIP)
  const nearest = inside.reduce<[LayoutSide, number] | undefined>(
    (best, next) => (best === undefined || next[1] < best[1] ? next : best),
    undefined
  )
  return nearest?.[0]
}

/** The element the whole layout is drawn in, which the edge strips are measured against. */
export const LayoutRootContext = createContext<{ current: HTMLElement | null }>({ current: null })

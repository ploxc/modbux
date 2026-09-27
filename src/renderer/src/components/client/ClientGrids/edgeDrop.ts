import { LayoutSide } from '@shared'
import { createContext } from 'react'

/** How far into the layout, as a part of its width or height, a drop docks along the edge. */
export const EDGE_SHARE = 0.1

/**
 * The edge of `rect` a drop at the point docks along, the nearest one when two
 * corners' strips overlap, or none when the point is further in.
 */
export const edgeSideOf = (
  rect: { left: number; right: number; top: number; bottom: number },
  x: number,
  y: number
): LayoutSide | undefined => {
  const width = (rect.right - rect.left) * EDGE_SHARE
  const height = (rect.bottom - rect.top) * EDGE_SHARE
  const reach: [LayoutSide, number][] = [
    ['left', (x - rect.left) / width],
    ['right', (rect.right - x) / width],
    ['top', (y - rect.top) / height],
    ['bottom', (rect.bottom - y) / height]
  ]
  const inside = reach.filter(([, depth]) => depth >= 0 && depth <= 1)
  const nearest = inside.reduce<[LayoutSide, number] | undefined>(
    (best, next) => (best === undefined || next[1] < best[1] ? next : best),
    undefined
  )
  return nearest?.[0]
}

/** The element the whole layout is drawn in, which the edge strips are measured against. */
export const LayoutRootContext = createContext<{ current: HTMLElement | null }>({ current: null })

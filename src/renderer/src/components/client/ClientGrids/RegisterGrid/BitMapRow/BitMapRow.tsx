import { GridRow, GridRowProps } from '@mui/x-data-grid/components'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useBitMapZustand } from '@renderer/context/bitmap.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'
import { BITMAP_DATATYPE } from '@shared'
import { useEffect, useRef } from 'react'
import BitMapDetailPanel from '../BitMapDetailPanel/BitMapDetailPanel'

// ─────────────────────────────────────────────────────────────────────────────
// BitMapRow, used as `slots.row` in the DataGrid.
//
// Normal rows render as GridRow unchanged. A bitmap row wraps GridRow and the
// detail panel in one div, and reports what the panel measures so the grid can
// give the row a height that holds it. Before that, the grid's row positions
// were multiples of its fixed rowHeight and the panel's height reached none of
// them: with virtualisation on, the rows below the expanded one sat under the
// ones above them, and the last of them was out of scroll reach by exactly the
// panel's height.
// ─────────────────────────────────────────────────────────────────────────────

const BitMapRow = meme((props: GridRowProps): JSX.Element => {
  const address = props.rowId as number

  const expandedAddress = useBitMapZustand((z) => z.expandedAddress)
  const isExpanded = expandedAddress === address

  const isBitmap =
    useClientZustand((z) => z.registerMapping[z.registerConfig.type][address]?.dataType) ===
    BITMAP_DATATYPE

  const panelRef = useRef<HTMLDivElement>(null)

  // The panel is four rows of bit cards above 560px of container width and
  // eight below, so its height is a measurement rather than a constant. The
  // observer keeps it true across a window resize as well as a first render.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      useBitMapZustand.getState().setDetailHeight(entry.contentRect.height)
    })
    observer.observe(panel)

    return (): void => observer.disconnect()
  }, [isBitmap, isExpanded])

  if (!isBitmap) {
    // Fast path: render as a normal row, no overhead.
    return <GridRow {...props} />
  }

  // No style on the wrapper: `renderRow` in @mui/x-virtualizer hands the row
  // slot none, so `props.style` is undefined and reading it here only suggests
  // the wrapper carries the scroller's geometry.
  return (
    <div data-id={address}>
      {/* The row is held at its own height by the expanded-row rule in
          RegisterGrid's sx: MUI writes min-height, max-height and --height
          from what getRowHeight answered, over anything passed in style. */}
      <GridRow {...props} />

      {isExpanded && (
        <div ref={panelRef} style={{ overflow: 'hidden' }}>
          <BitMapDetailPanel address={address} />
        </div>
      )}
    </div>
  )
})

export default BitMapRow

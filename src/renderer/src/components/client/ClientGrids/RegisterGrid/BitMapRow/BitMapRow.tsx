import { GridRow, GridRowProps } from '@mui/x-data-grid/components/GridRow'
import { useBitMapZustand } from '@renderer/context/bitmap.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { BITMAP_DATATYPE } from '../../../../../../../shared/types/bitmap'
import BitMapDetailPanel from '../BitMapDetailPanel/BitMapDetailPanel'

// ─────────────────────────────────────────────────────────────────────────────
// BitMapRow – used as `slots.row` in the DataGrid.
// Normal rows render as GridRow unchanged.
// Bitmap rows wrap GridRow + BitMapDetailPanel in an outer div that owns
// the virtual-scroller height slot when expanded.
// ─────────────────────────────────────────────────────────────────────────────

const BitMapRow = (props: GridRowProps): JSX.Element => {
  const address = props.rowId as number

  const expandedAddress = useBitMapZustand((z) => z.expandedAddress)
  const isExpanded = expandedAddress === address

  const type = useRootZustand((z) => z.registerConfig.type)
  const registerMap = useRootZustand((z) => z.registerMapping[type])
  const isBitMap = (registerMap[address]?.dataType as string) === BITMAP_DATATYPE

  if (!isBitMap) {
    // Fast path: render as normal row, no overhead
    return <GridRow {...props} />
  }

  // For bitmap rows the outer div owns the height slot from the virtual scroller.
  // We strip the position style from GridRow so it renders naturally (at rowHeight)
  // inside the outer div instead of repositioning itself absolutely.
  const { style, ...rowProps } = props

  return (
    <div
      // Forward virtual-scroller positioning (position, top, left, width, height).
      // height = BITMAP_ROW_HEIGHT when collapsed,
      //          BITMAP_ROW_HEIGHT + BITMAP_DETAIL_HEIGHT when expanded.
      style={style}
      data-id={address}
    >
      {/* Override --height CSS var + min/max-height so MUI class rules don't stretch the row */}
      <GridRow {...rowProps} />

      {/* Detail panel in the space below the row cells */}
      {isBitMap && isExpanded && (
        <div style={{ overflow: 'hidden' }}>
          <BitMapDetailPanel address={address} />
        </div>
      )}
    </div>
  )
}

export default BitMapRow

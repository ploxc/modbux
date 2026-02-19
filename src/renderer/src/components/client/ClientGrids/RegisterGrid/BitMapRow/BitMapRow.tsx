import { GridRow, GridRowProps } from '@mui/x-data-grid/components/GridRow'
import { useBitMapZustand } from '@renderer/context/bitmap.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { BITMAP_DATATYPE } from '../../../../../../../shared/types/bitmap'
import BitMapDetailPanel, { BITMAP_DETAIL_HEIGHT } from '../BitMapDetailPanel/BitMapDetailPanel'

export const BITMAP_ROW_HEIGHT = 40 // standard compact row height

// ─────────────────────────────────────────────────────────────────────────────
// BitMapRow
//
// Used as `slots.row` in the DataGrid.  For normal rows it renders exactly
// like the default GridRow.  For rows whose dataType is 'bitmap' it:
//   • Wraps GridRow in an outer div that owns the virtual-scroller height slot
//   • Passes GridRow without the position style so cells render at rowHeight (40px)
//   • Renders BitMapDetailPanel in the remaining space below when expanded
//
// Integration (add to RegisterGrid.tsx after merge):
//
//   import BitMapRow, { BITMAP_ROW_HEIGHT } from './BitMapRow/BitMapRow'
//   import { BITMAP_DETAIL_HEIGHT } from './BitMapDetailPanel/BitMapDetailPanel'
//   import { useBitMapZustand } from '@renderer/context/bitmap.zustand'
//   import { BITMAP_DATATYPE } from '../../../shared/types/bitmap'
//
//   // Inside RegisterGridContent, alongside existing hooks:
//   const registerMapping = useRootZustand(z => z.registerMapping[z.registerConfig.type])
//   const expandedAddress = useBitMapZustand(z => z.expandedAddress)
//
//   <DataGrid
//     ...
//     slots={{ toolbar: RegisterGridToolbar, footer: Footer, row: BitMapRow }}
//     getRowHeight={({ id }) => {
//       const isBitmap = registerMapping[id as number]?.dataType === BITMAP_DATATYPE
//       const isExpanded = expandedAddress === id
//       return isBitmap && isExpanded
//         ? BITMAP_ROW_HEIGHT + BITMAP_DETAIL_HEIGHT
//         : BITMAP_ROW_HEIGHT
//     }}
//   />
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
      {/* Normal row cells — no position style, height comes from rowHeight prop */}
      <GridRow {...rowProps} />

      {/* Detail panel in the space below the row cells */}
      {isBitMap && isExpanded && (
        <div style={{ height: BITMAP_DETAIL_HEIGHT, overflow: 'hidden' }}>
          <BitMapDetailPanel address={address} />
        </div>
      )}
    </div>
  )
}

export default BitMapRow

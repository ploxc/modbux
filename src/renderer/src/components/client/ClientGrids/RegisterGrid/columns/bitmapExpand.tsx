import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material'
import { Box, IconButton } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid/models'
import { useBitMapZustand } from '@renderer/context/bitmap.zustand'
import { RegisterData, RegisterMapObject } from '@shared'
import { BITMAP_DATATYPE } from '../../../../../../../shared/types/bitmap'

// ─────────────────────────────────────────────────────────────────────────────
// bitmapExpandColumn
//
// Renders a collapse/expand toggle for bitmap rows and is invisible for all
// other rows.  Insert this column into the columns array (columns/index.tsx)
// right after the dataType column for holding_registers, e.g.:
//
//   import { bitmapExpandColumn } from './bitmapExpand'
//   // inside the registers16Bit block:
//   columns.push(bitmapExpandColumn(registerMap))
//
// ─────────────────────────────────────────────────────────────────────────────

interface ExpandCellProps {
  address: number
  isBitMap: boolean
}

const ExpandCell = ({ address, isBitMap }: ExpandCellProps): JSX.Element => {
  const expandedAddress = useBitMapZustand((z) => z.expandedAddress)
  const toggleExpanded = useBitMapZustand((z) => z.toggleExpanded)
  const isExpanded = expandedAddress === address

  if (!isBitMap) return <></>

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
      <IconButton
        size="small"
        onClick={() => toggleExpanded(address)}
        title={isExpanded ? 'Collapse bitmap detail' : 'Expand bitmap detail'}
        sx={{ p: 0.25 }}
      >
        {isExpanded ? (
          <KeyboardArrowDown fontSize="small" />
        ) : (
          <KeyboardArrowRight fontSize="small" />
        )}
      </IconButton>
    </Box>
  )
}

export const bitmapExpandColumn = (registerMap: RegisterMapObject): GridColDef<RegisterData> => ({
  field: 'bitmapExpand',
  headerName: '',
  sortable: false,
  filterable: false,
  hideable: false,
  disableColumnMenu: true,
  width: 32,
  minWidth: 32,
  maxWidth: 32,
  renderCell: ({ row }): JSX.Element => {
    const isBitMap = (registerMap[row.id]?.dataType as string) === BITMAP_DATATYPE
    return <ExpandCell address={row.id} isBitMap={isBitMap} />
  }
})

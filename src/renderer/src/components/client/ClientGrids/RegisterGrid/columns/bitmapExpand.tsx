import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material'
import { Box } from '@mui/material'
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

export const ExpandCell = ({ address, isBitMap }: ExpandCellProps): JSX.Element => {
  const expandedAddress = useBitMapZustand((z) => z.expandedAddress)
  const toggleExpanded = useBitMapZustand((z) => z.toggleExpanded)
  const isExpanded = expandedAddress === address

  if (!isBitMap) return <></>

  return (
    <Box
      onClick={() => toggleExpanded(address)}
      title={isExpanded ? 'Hide bitmap detail' : 'Show bitmap detail'}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        height: '100%',
        width: '100%',
        cursor: 'pointer',
        color: isExpanded ? theme.palette.primary.main : theme.palette.text.secondary,
        '&:hover': { color: theme.palette.primary.main }
      })}
    >
      {isExpanded ? (
        <KeyboardArrowDown fontSize="small" />
      ) : (
        <KeyboardArrowRight fontSize="small" />
      )}
      <Box
        component="span"
        sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, letterSpacing: 0.5 }}
      >
        {isExpanded ? 'hide' : 'show'}
      </Box>
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

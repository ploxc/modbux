import { GridColDef } from '@mui/x-data-grid/models'
import { AddressGroup, BITMAP_DATATYPE, RegisterData, RegisterMapObject } from '@shared'
import { ConvertedValueCell, convertedValueColumn, getConvertedValue } from './convertedValue'

// ─────────────────────────────────────────────────────────────────────────────
// bitmapValueColumn
//
// Replaces convertedValueColumn in columns/index.tsx so that bitmap rows show
// an expand/collapse toggle in the value cell instead of a numeric value.
// Every other row is the value column's own cell, which is why both halves are
// called here rather than copied.
// ─────────────────────────────────────────────────────────────────────────────

export const bitmapValueColumn = (
  registerMap: RegisterMapObject,
  showRaw: boolean,
  addressGroups: AddressGroup[]
): GridColDef<RegisterData> => ({
  ...convertedValueColumn(registerMap, showRaw, addressGroups),
  valueGetter: (_: unknown, row: RegisterData): number | string | undefined => {
    if (registerMap[row.id]?.dataType === BITMAP_DATATYPE) return undefined
    return getConvertedValue(row, registerMap, showRaw, addressGroups)
  },
  renderCell: ({ row }) => <ConvertedValueCell address={row.id} bitmap />
})

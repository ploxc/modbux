import { GridColDef } from '@mui/x-data-grid/models'
import { BITMAP_DATATYPE, RegisterData, RegisterMapObject } from '@shared'
import { convertedValueColumn, getConvertedValue, renderConvertedValue } from './convertedValue'
import { ExpandCell } from './ExpandCell'

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
  showRaw: boolean
): GridColDef<RegisterData> => ({
  ...convertedValueColumn(registerMap, showRaw),
  valueGetter: (_: unknown, row: RegisterData): number | string | undefined => {
    if (registerMap[row.id]?.dataType === BITMAP_DATATYPE) return undefined
    return getConvertedValue(row, registerMap, showRaw)
  },
  renderCell: (params): JSX.Element | string | number => {
    // An error is what the cell says whatever the data type is, so a bitmap row
    // that failed to read gets the same red text as any other.
    const isBitmap = registerMap[params.row.id]?.dataType === BITMAP_DATATYPE
    if (isBitmap && !params.row.error) return <ExpandCell address={params.row.id} />
    return renderConvertedValue(params)
  }
})

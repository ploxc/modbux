import { GridColDef } from '@mui/x-data-grid/models'
import { BITMAP_DATATYPE, RegisterData, RegisterMapObject } from '@shared'
import { convertedValueColumn } from './convertedValue'
import { ExpandCell } from './bitmapExpand'

// ─────────────────────────────────────────────────────────────────────────────
// bitmapValueColumn
//
// Replaces convertedValueColumn in columns/index.tsx so that bitmap rows show
// an expand/collapse toggle in the value cell instead of a numeric value.
// All non-bitmap rows render exactly as convertedValueColumn does.
// ─────────────────────────────────────────────────────────────────────────────

export const bitmapValueColumn = (
  registerMap: RegisterMapObject,
  showRaw: boolean
): GridColDef<RegisterData> => {
  const base = convertedValueColumn(registerMap, showRaw)

  const baseValueGetter = base.valueGetter as (
    value: unknown,
    row: RegisterData
  ) => number | string | undefined

  return {
    ...base,
    valueGetter: (value: unknown, row: RegisterData): number | string | undefined => {
      if (registerMap[row.id]?.dataType === BITMAP_DATATYPE) return undefined
      return baseValueGetter(value, row)
    },
    renderCell: (params): JSX.Element => {
      const isBitmap = registerMap[params.row.id]?.dataType === BITMAP_DATATYPE
      if (isBitmap) {
        return <ExpandCell address={params.row.id} isBitmap={true} />
      }
      // For non-bitmap rows: use the already-formatted value from valueFormatter
      return <>{params.formattedValue ?? params.value ?? ''}</>
    }
  }
}

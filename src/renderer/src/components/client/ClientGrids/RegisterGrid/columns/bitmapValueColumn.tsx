import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData, RegisterMapObject } from '@shared'
import { BITMAP_DATATYPE } from '../../../../../../../shared/types/bitmap'
import { convertedValueColumn } from './convertedValue'
import { ExpandCell } from './bitmapExpand'

// ─────────────────────────────────────────────────────────────────────────────
// bitmapValueColumn
//
// Replaces convertedValueColumn in columns/index.tsx so that bitmap rows show
// an expand/collapse toggle in the value cell instead of a numeric value.
// All non-bitmap rows render exactly as convertedValueColumn does.
//
// Usage in columns/index.tsx:
//   import { bitmapValueColumn } from './bitmapValueColumn'
//   // replace:  convertedValueColumn(registerMap, showRaw)
//   // with:     bitmapValueColumn(registerMap, showRaw)
// ─────────────────────────────────────────────────────────────────────────────

export const bitmapValueColumn = (
  registerMap: RegisterMapObject,
  showRaw: boolean
): GridColDef<RegisterData> => {
  const base = convertedValueColumn(registerMap, showRaw)

  return {
    ...base,
    renderCell: (params): JSX.Element => {
      const isBitmap = (registerMap[params.row.id]?.dataType as string) === BITMAP_DATATYPE
      if (isBitmap) {
        return <ExpandCell address={params.row.id} isBitMap={true} />
      }
      // For non-bitmap rows: use the already-formatted value from valueFormatter
      return <>{params.formattedValue ?? params.value ?? ''}</>
    }
  }
}

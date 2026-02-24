import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData } from '@shared'

export const groupIndexColumn: GridColDef<RegisterData> = {
  field: 'groupIndex',
  sortable: false,
  hideable: false,
  disableColumnMenu: true,
  headerName: 'G',
  width: 30,
  minWidth: 30,
  valueFormatter: (v) => (v !== undefined ? v + 1 : '')
}

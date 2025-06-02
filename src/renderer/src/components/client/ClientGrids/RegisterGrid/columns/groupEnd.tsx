import { CheckCircle, CircleOutlined } from '@mui/icons-material'
import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData, RegisterMapObject } from '@shared'

export const groupEndColumn = (
  registerMap: RegisterMapObject
): GridColDef<RegisterData, boolean> => ({
  field: 'groupEnd',
  sortable: false,
  headerName: 'End',
  minWidth: 38,
  maxWidth: 38,
  type: 'boolean',
  editable: true,
  valueGetter: (_, row): boolean => {
    const address = row.id
    const register = registerMap[address]
    if (!register) return false
    return !!register.groupEnd
  },
  renderCell: ({ value, row }) =>
    registerMap[row.id]?.dataType === undefined ||
    registerMap[row.id]?.dataType === 'none' ? null : value ? (
      <CheckCircle color="primary" fontSize="small" />
    ) : (
      <CircleOutlined fontSize="small" sx={{ opacity: 0.25 }} />
    )
})

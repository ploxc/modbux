import { GridColDef } from '@mui/x-data-grid/models'
import { DataTypeSchema, RegisterData, RegisterMapObject } from '@shared'

export const dataTypeColumn = (registerMap: RegisterMapObject): GridColDef<RegisterData> => ({
  field: 'dataType',
  sortable: false,
  headerName: 'Data Type',
  width: 80,
  type: 'singleSelect',
  editable: true,
  valueGetter: (_, row) => {
    const address = row.id
    const register = registerMap[address]
    if (!register) return 'none'
    return register.dataType
  },
  valueOptions: DataTypeSchema.options.map((value) => ({ value, label: value.toUpperCase() })),
  renderCell: ({ value }) => (value === 'none' ? '' : value ? value.toUpperCase() : undefined)
})

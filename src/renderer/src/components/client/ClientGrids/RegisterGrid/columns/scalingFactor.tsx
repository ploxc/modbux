import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData, RegisterMapObject } from '@shared'

export const scalingFactorColumn = (registerMap: RegisterMapObject): GridColDef => ({
  field: 'scalingFactor',
  sortable: false,
  headerName: 'Scale',
  width: 60,
  type: 'number',
  editable: true,
  valueGetter: (_, row) => {
    const address = (row as RegisterData).id
    const register = registerMap[address]
    if (!register?.scalingFactor) return 1
    return register.scalingFactor
  },
  renderCell: ({ value, row }) =>
    registerMap[row.id]?.dataType && registerMap[row.id]?.dataType !== 'none' ? value : ''
})

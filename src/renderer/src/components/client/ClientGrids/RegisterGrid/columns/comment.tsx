import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData, RegisterMapObject } from '@shared'

export const commentColumn = (registerMap: RegisterMapObject): GridColDef => ({
  field: 'comment',
  sortable: false,
  headerName: 'Comment',
  minWidth: 120,
  flex: 1,
  editable: true,
  valueGetter: (_, row) => {
    const address = (row as RegisterData).id
    const register = registerMap[address]
    return register?.comment
  }
})

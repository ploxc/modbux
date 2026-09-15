import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData, RegisterMapObject, scalableDataTypes } from '@shared'
import { ReactNode } from 'react'

export const scalingFactorColumn = (registerMap: RegisterMapObject): GridColDef<RegisterData> => ({
  field: 'scalingFactor',
  headerName: 'Scale',
  width: 60,
  type: 'number',
  editable: true,
  valueGetter: (_, row): number => {
    const address = row.id
    const register = registerMap[address]
    if (!register?.scalingFactor) return 1
    return register.scalingFactor
  },
  renderCell: ({ value, row }): ReactNode | undefined => {
    // `registerMap` is the map the column was built from, so the store read
    // this replaced answered the same thing one render later at best.
    const dataType = registerMap[row.id]?.dataType
    return dataType && scalableDataTypes.includes(dataType) ? value : ''
  }
})

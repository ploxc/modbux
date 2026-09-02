import { GridColDef } from '@mui/x-data-grid/models'
import { useClientZustand } from '@renderer/context/client.zustand'
import { DataType, RegisterData, RegisterMapObject, RegisterType } from '@shared'
import { ReactNode } from 'react'

export const scalingFactorColumn = (
  registerMap: RegisterMapObject,
  type: RegisterType
): GridColDef<RegisterData> => ({
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
    const enabledDatatypes: DataType[] = [
      'double',
      'float',
      'int16',
      'int32',
      'int64',
      'uint16',
      'uint32',
      'uint64'
    ]

    const dataType = useClientZustand.getState().registerMapping[type][row.id]?.dataType
    const enabled = dataType && enabledDatatypes.includes(dataType)

    return registerMap[row.id]?.dataType && registerMap[row.id]?.dataType !== 'none' && enabled
      ? value
      : ''
  }
})

import { Box } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import {
  DataType,
  getConventionalAddress,
  RegisterData,
  RegisterDataWords,
  RegisterMapObject,
  RegisterType
} from '@shared'
import { round } from 'lodash'
import { useMemo } from 'react'

const registerValueToString = (
  value: number | bigint
): { numberString: string; irrelevant: boolean } => {
  let numberString: string = '0'
  numberString = value.toString(10)

  const irrelevant = numberString === '0'

  return { numberString, irrelevant }
}

const addressColumn: GridColDef<RegisterData, number> = {
  field: 'id',
  sortable: false,
  hideable: false,
  headerName: 'Addr.',
  width: 60,
  renderCell: ({ value }) => <Box sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{value}</Box>
}

const conventionalAddresColumn = (
  type: RegisterType,
  addressBase: string
): GridColDef<RegisterData, number> => ({
  field: 'conventionalAddress',
  sortable: false,
  headerName: 'Conv.',
  width: 60,
  renderCell: ({ row }) => {
    const value = getConventionalAddress(type, String(row.id), addressBase)
    return (
      <Box
        sx={(theme) => ({
          fontFamily: 'monospace',
          color: theme.palette.primary.light
        })}
      >
        {value}
      </Box>
    )
  }
})

const hexColumn: GridColDef<RegisterData, string> = {
  field: 'hex',
  sortable: false,
  headerName: 'HEX',
  width: 60,
  renderCell: ({ value }) => (
    <Box
      sx={(theme) => ({
        fontFamily: 'monospace',
        opacity: 0.75,
        color: theme.palette.primary.light
      })}
    >
      {value?.toUpperCase()}
    </Box>
  )
}

const convertedValueColumn = (registerMap: RegisterMapObject): GridColDef => ({
  field: 'value',
  sortable: false,
  hideable: false,
  type: 'number',
  headerName: 'Value',
  width: 150,
  valueGetter: (_, row) => {
    const registerData = row as RegisterData
    const address = registerData.id
    const dataType = registerMap[address]?.dataType

    const value = dataType ? String(registerData.words?.[dataType]) : undefined
    if (!value) return undefined

    const scalingFactor = registerMap[address]?.scalingFactor ?? 1
    const decimalPlaces = String(scalingFactor).split('.')[1]?.length ?? 0

    const float = dataType === DataType.Float || dataType === DataType.Double
    const decimalPlacesFloat = float ? value.split('.')[1]?.length ?? 0 : 0

    console.log({ value, decimalPlaces, decimalPlacesFloat })

    return round(Number(value) * scalingFactor, decimalPlaces + decimalPlacesFloat)
  },
  valueFormatter: (v) => (v ? Number(v) : '')
})

const dataTypeColumn = (registerMap: RegisterMapObject): GridColDef => ({
  field: 'dataType',
  sortable: false,
  headerName: 'Data Type',
  width: 80,
  type: 'singleSelect',
  editable: true,
  valueGetter: (_, row) => {
    const address = (row as RegisterData).id
    const register = registerMap[address]
    if (!register) return DataType.None
    return register.dataType
  },
  valueOptions: Object.values(DataType).map((value) => ({ value, label: value.toUpperCase() })),
  renderCell: ({ value }) =>
    value === DataType.None ? '' : value ? value.toUpperCase() : undefined
})

const scalingFactorColumn = (registerMap: RegisterMapObject): GridColDef => ({
  field: 'scalingFactor',
  sortable: false,
  headerName: 'Scaling',
  width: 80,
  type: 'number',
  editable: true,
  valueGetter: (_, row) => {
    const address = (row as RegisterData).id
    const register = registerMap[address]
    if (!register?.scalingFactor) return 1
    return register.scalingFactor
  },
  renderCell: ({ value }) => value
})

const commentColumn = (registerMap: RegisterMapObject): GridColDef => ({
  field: 'comment',
  sortable: false,
  headerName: 'Comment',
  minWidth: 300,
  flex:1,
  editable: true,
  valueGetter: (_, row) => {
    const address = (row as RegisterData).id
    const register = registerMap[address]
    return register?.comment
  },
})

const valueColumn = (
  key: DataType,
  width: number
): GridColDef<RegisterData, RegisterDataWords, RegisterDataWords> => ({
  type: 'number',
  field: `word_${key}`,
  headerName: key.toUpperCase(),
  width,
  renderCell: ({ row }): JSX.Element | null => {
    const value = row.words?.[key]
    if (value === undefined) return null

    const { numberString, irrelevant } = registerValueToString(value)
    return <Box sx={{ opacity: irrelevant ? 0.25 : undefined }}>{numberString}</Box>
  }
})

const useRegisterGridColumns = () => {
  const type = useRootZustand((z) => z.registerConfig.type)
  const registerMap = useRootZustand((z) => z.registerMapping[type])

  const addressBase = useRootZustand((z) => z.addressBase)
  const advanced = useLayoutZustand((z) => z.advanced)
  const show64Bit = useLayoutZustand((z) => z.show64Bit)

  return useMemo(() => {
    const columns: GridColDef<RegisterData>[] = [
      addressColumn,
      conventionalAddresColumn(type, addressBase),
      dataTypeColumn(registerMap),
      convertedValueColumn(registerMap),
      scalingFactorColumn(registerMap),
      hexColumn
    ]

    if (advanced) {
      columns.push(
        valueColumn(DataType.Int16, 70),
        valueColumn(DataType.UInt16, 70),
        valueColumn(DataType.Int32, 100),
        valueColumn(DataType.UInt32, 100),
        valueColumn(DataType.Float, 200)
      )
    }

    if (advanced && show64Bit) {
      columns.push(
        valueColumn(DataType.Int64, 160),
        valueColumn(DataType.UInt64, 160),
        valueColumn(DataType.Double, 200)
      )
    }

    columns.push(commentColumn(registerMap))

    return columns
  }, [type, addressBase, advanced, show64Bit, registerMap])
}

export default useRegisterGridColumns

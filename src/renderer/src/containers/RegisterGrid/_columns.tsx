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

//
//
// ID = register address
const addressColumn: GridColDef<RegisterData, number> = {
  field: 'id',
  sortable: false,
  hideable: false,
  headerName: 'Addr.',
  width: 60,
  renderCell: ({ value }) => <Box sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{value}</Box>
}

//
//
// Show the address by convention
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

//
//
// Raw hex value of the register
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

//
//
// When selecting a datatype the value of that datatype is shown in this column
const convertedValueColumn = (registerMap: RegisterMapObject): GridColDef<RegisterData> => ({
  field: 'value',
  sortable: false,
  hideable: false,
  type: 'number',
  headerName: 'Value',
  width: 150,
  valueGetter: (_, row) => {
    const address = row.id

    // Get the defined datatype from the register map
    const dataType = registerMap[address]?.dataType

    // Get the value for the register datatype, they are all there, the defined datatype
    // extracts that value and shows it in the value column
    const value = dataType ? String(row.words?.[dataType]) : undefined
    if (!value) return undefined

    // Get the scaling factor from the register map
    // And the decimal places for rounding the scaled value because js can add some unwanted
    // decimal places by deviding by the scaling factor
    const scalingFactor = registerMap[address]?.scalingFactor ?? 1
    const decimalPlaces = String(scalingFactor).split('.')[1]?.length ?? 0

    // When we have a floating point number, we add the decimal places of it
    // to the decimal places of the scaling factor, else we would round the float completely
    const float = dataType === DataType.Float || dataType === DataType.Double
    const decimalPlacesFloat = float ? (value.split('.')[1]?.length ?? 0) : 0

    // Round the scaled value to the given decimal places
    return round(Number(value) * scalingFactor, decimalPlaces + decimalPlacesFloat)
  },
  valueFormatter: (v) => (v ? Number(v) : '')
})

//
//
// Column to select the register datatype
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

//
//
// Column to set the value's scaling factor, for better interpreting the value
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

//
//
// Column to set a comment for the register
const commentColumn = (registerMap: RegisterMapObject): GridColDef => ({
  field: 'comment',
  sortable: false,
  headerName: 'Comment',
  minWidth: 300,
  flex: 1,
  editable: true,
  valueGetter: (_, row) => {
    const address = (row as RegisterData).id
    const register = registerMap[address]
    return register?.comment
  }
})

//
//
// Generic comonent to show the columns for each converted value (advance mode)
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

//
//
// COLUMNS
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

    // Advanced mode columns
    if (advanced) {
      columns.push(
        valueColumn(DataType.Int16, 70),
        valueColumn(DataType.UInt16, 70),
        valueColumn(DataType.Int32, 100),
        valueColumn(DataType.UInt32, 100),
        valueColumn(DataType.Float, 200)
      )
    }

    // Show 64 bit columns only in advanced mode, these are not very common, but they are there
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

import { Edit } from '@mui/icons-material'
import { Box } from '@mui/material'
import {
  GridActionsCellItem,
  GridActionsColDef,
  GridColDef,
  useGridApiContext
} from '@mui/x-data-grid'
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
import { useMemo, useRef, useState } from 'react'
import WriteModal from './WriteModal/WriteModal'

const WordLedDisplay = ({ value }) => {
  // Zorg dat we exact 16 bits hebben
  const bits = value
    .toString(2)
    .padStart(16, '0')
    .split('')
    .map((b) => b === '1')

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        pb: 0.05
      }}
    >
      {[0, 1].map((row) => (
        <Box
          key={row}
          sx={{
            display: 'flex',
            gap: '2px',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          {bits.slice(row * 8, row * 8 + 8).map((on, i) => (
            <Box
              key={i}
              sx={(theme) => ({
                width: 7,
                aspectRatio: 1,
                borderRadius: '50%',
                backgroundColor: on ? theme.palette.primary.main : theme.palette.background.default // groen of grijs
              })}
            />
          ))}
        </Box>
      ))}
    </Box>
  )
}

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
  width: 50,
  renderCell: ({ value }) => (
    <Box
      sx={(theme) => ({
        fontFamily: 'monospace',
        color: theme.palette.primary.light
      })}
    >
      {value?.toUpperCase()}
    </Box>
  )
}

const binColumn: GridColDef<RegisterData, string> = {
  field: 'bin',
  headerName: 'BIN',
  width: 80,
  renderCell: ({ row }) => <WordLedDisplay value={row.words?.[DataType.UInt16]} />
}

//
//
// When selecting a datatype the value of that datatype is shown in this column
const convertedValueColumn = (registerMap: RegisterMapObject): GridColDef<RegisterData> => ({
  field: 'value',
  sortable: false,
  hideable: false,
  type: 'string',
  headerName: 'Value',
  width: 150,
  valueGetter: (_, row) => {
    const address = row.id

    // Get the defined datatype from the register map
    const dataType = registerMap[address]?.dataType

    // Get the value for the register datatype, they are all there, the defined datatype
    // extracts that value and shows it in the value column
    const value = dataType && dataType !== DataType.None ? String(row.words?.[dataType]) : undefined
    if (!value) return undefined

    // For strings we must calculate the length until the next defined datatype
    let count = 1
    if (dataType === DataType.Utf8) {
      const config = useRootZustand.getState().registerConfig
      const { length, address: startAddress } = config

      let register = registerMap[address + count]

      while (
        address <= startAddress + length &&
        (!register || register.dataType === DataType.None || !register.dataType)
      ) {
        count++
        register = registerMap[address + count]
      }
      const startIndex = address - startAddress
      return value.slice(startIndex * 2, (startIndex + count) * 2)
    }

    // Return a string when it's a string :D
    if (dataType === DataType.DateTime || dataType === DataType.Unix) return value

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
    const isNotANumberValue = isNaN(Number(value))
    if (isNotANumberValue) return undefined

    return round(Number(value) * scalingFactor, decimalPlaces + decimalPlacesFloat)
  },
  valueFormatter: (v) => (v !== undefined ? v : '')
})

//
//
// Column to select the register datatype
const dataTypeColumn = (registerMap: RegisterMapObject): GridColDef<RegisterData> => ({
  field: 'dataType',
  sortable: false,
  headerName: 'Data Type',
  width: 80,
  type: 'singleSelect',
  editable: true,
  valueGetter: (_, row) => {
    const address = row.id
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
  width: number,
  type?: GridColDef['type']
): GridColDef<RegisterData, RegisterDataWords, RegisterDataWords> => ({
  type: type || 'number',
  field: `word_${key}`,
  headerName: key.toUpperCase(),
  width,
  renderCell: ({ row }): JSX.Element | null => {
    const value = row.words?.[key]
    if (value === undefined) return null

    const { numberString, irrelevant } = registerValueToString(value)
    return (
      <Box
        title={String(value)}
        sx={{
          opacity: irrelevant ? 0.25 : undefined,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis'
        }}
      >
        {numberString}
      </Box>
    )
  }
})

//
//
// Generic component to show bit values
const bitColumn: GridColDef<RegisterData, boolean, boolean> = {
  field: 'bit',
  type: 'boolean',
  headerName: 'Bit',
  width: 80,
  renderCell: ({ value }) => (
    <Box
      sx={(theme) => ({
        background: value ? theme.palette.success.main : undefined,
        color: value ? theme.palette.success.contrastText : undefined,
        fontWeight: value ? 'bold' : undefined,
        opacity: value ? 1 : 0.5,
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      })}
    >
      {value ? 'TRUE' : 'FALSE'}
    </Box>
  )
}

//
//
// Write action column
const writeActionColumn = (type: RegisterType): GridActionsColDef<RegisterData> => ({
  field: 'actions',
  type: 'actions',
  sortable: false,
  headerName: '',
  minWidth: 40,
  maxWidth: 40,
  getActions: ({ row, id }) => {
    const address = row.id
    const [open, setOpen] = useState(false)

    const text = type === RegisterType.Coils ? 'Write Coil' : 'Write Register'
    const actionCellRef = useRef<HTMLDivElement>(null)
    const apiRef = useGridApiContext()

    return row.isScanned
      ? []
      : [
          <>
            <GridActionsCellItem
              ref={actionCellRef}
              disabled={false}
              icon={<Edit fontSize="small" />}
              title={text}
              label={''}
              onClick={() => {
                apiRef.current.selectRow(id, true, true)
                setOpen(true)
              }}
              color="primary"
            />
            {open && (
              <WriteModal
                open={open}
                onClose={() => setOpen(false)}
                address={address}
                actionCellRef={actionCellRef}
                type={type}
              />
            )}
          </>
        ]
  }
})

//
//
// COLUMNS
const useRegisterGridColumns = () => {
  const type = useRootZustand((z) => z.registerConfig.type)
  const registerMap = useRootZustand((z) => z.registerMapping[type])

  const addressBase = useRootZustand((z) => z.registerConfig.addressBase)
  const advanced = useRootZustand((z) => z.registerConfig.advancedMode)
  const show64Bit = useRootZustand((z) => z.registerConfig.show64BitValues)
  const showString = useRootZustand((z) => z.registerConfig.showStringValues)

  return useMemo(() => {
    const registers16Bit = [RegisterType.InputRegisters, RegisterType.HoldingRegisters].includes(
      type
    )

    const columns: GridColDef<RegisterData>[] = [
      addressColumn,
      conventionalAddresColumn(type, addressBase)
    ]

    if (!registers16Bit) {
      columns.push(bitColumn)
    }

    if (registers16Bit) {
      columns.push(
        dataTypeColumn(registerMap),
        convertedValueColumn(registerMap),
        scalingFactorColumn(registerMap),
        hexColumn,
        binColumn
      )
    }

    // Advanced mode columns
    if (advanced && registers16Bit) {
      columns.push(
        valueColumn(DataType.Int16, 70),
        valueColumn(DataType.UInt16, 70),
        valueColumn(DataType.Int32, 100),
        valueColumn(DataType.UInt32, 100),
        valueColumn(DataType.Float, 100)
      )
    }

    // Show 64 bit columns only in advanced mode, these are not very common, but they are there
    if (advanced && show64Bit && registers16Bit) {
      columns.push(
        valueColumn(DataType.Int64, 160),
        valueColumn(DataType.UInt64, 160),
        valueColumn(DataType.Double, 160)
      )
    }

    if (advanced && showString && registers16Bit) {
      columns.push(
        valueColumn(DataType.Utf8, 120, 'string'),
        valueColumn(DataType.DateTime, 210, 'string')
      )
    }

    columns.push(commentColumn(registerMap))

    if ([RegisterType.Coils, RegisterType.HoldingRegisters].includes(type)) {
      columns.push(writeActionColumn(type))
    }

    return columns
  }, [type, addressBase, advanced, show64Bit, showString, registerMap])
}

export default useRegisterGridColumns

import { Box, Button, FormControlLabel, Paper, Radio, RadioGroup, TextField } from '@mui/material'
import { DataGrid, GridColDef } from '@mui/x-data-grid'
import { useState } from 'react'

const registerValueToString = (
  value: number | bigint,
  isFloat?: boolean
): { numberString: string; irrelevant: boolean } => {
  let numberString: string = '0'

  let realySmallNumber = false

  // Convert float to scientific notation with 2 decimal places
  if (typeof value !== 'bigint' && isFloat) {
    realySmallNumber = Math.abs(value) < 0.001 && Math.abs(value) > 0
    if (realySmallNumber) numberString = value.toExponential(2)
  } else {
    numberString = value.toString(10)
  }

  const irrelevant = numberString === '0' || realySmallNumber

  return { numberString, irrelevant }
}

const addressColumn: GridColDef<RowData, number> = {
  field: 'id',
  headerName: 'Address',
  width: 70,
  renderCell: ({ value }) => <Box sx={{ fontWeight: 'bold' }}>{value}</Box>
}

const hexColumn: GridColDef<RowData, string> = {
  field: 'hex',
  headerName: 'HEX',
  width: 50,
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

const valueColumn = (
  field: 'bigEndian' | 'littleEndian',
  key: keyof RowDataEndian,
  width: number
): GridColDef<RowData, RowDataEndian, RowDataEndian> => ({
  type: 'number',
  field: `${field}_${key}`,
  headerName: key.toUpperCase(),
  width,
  renderCell: ({ row }): JSX.Element => {
    const value = row[field][key]
    const isFloat = key === 'float' || key === 'double'
    const { numberString, irrelevant } = registerValueToString(value, isFloat)

    return <Box sx={{ opacity: irrelevant ? 0.25 : undefined }}>{numberString}</Box>
  }
})

const columns: GridColDef<RowData>[] = [
  addressColumn,
  hexColumn,
  valueColumn('bigEndian', 'int16', 70),
  valueColumn('bigEndian', 'uint16', 70),
  valueColumn('bigEndian', 'int32', 100),
  valueColumn('bigEndian', 'uint32', 100),
  valueColumn('bigEndian', 'int64', 160),
  valueColumn('bigEndian', 'uint64', 160),
  valueColumn('bigEndian', 'float', 100),
  valueColumn('bigEndian', 'double', 100)
]

function App(): JSX.Element {
  const [rows, setRows] = useState<RowData[]>([])

  const testRead = async (): Promise<void> => {
    const range = [32064, 54]
    console.log('Reading from', range)
    const result = await window.api.read(...range)
    setRows(result)
  }

  const [protocol, setProtocol] = useState<Protocol>('ModbusTcp')

  return (
    <Box
      sx={{
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        height: '100dvh',
        width: '100dvw'
      }}
    >
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', px: 1 }}>
        <Box sx={{ display: 'flex', width: '100%', gap: 1 }}>
          <RadioGroup
            row
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as Protocol)}
          >
            <FormControlLabel control={<Radio size="small" />} label="TCP" value={'ModbusTcp'} />
            <FormControlLabel control={<Radio size="small" />} label="RTU" value={'ModbusRtu'} />
          </RadioGroup>

          <TextField label="IP Address" variant="outlined" size="small" sx={{ width: 130 }} />
          <Box sx={{ display: 'flex', fontSize: 20, alignItems: 'center', pb: 0.5 }}>:</Box>
          <TextField label="Port" variant="outlined" size="small" sx={{ width: 70, mr: 2 }} />
          <TextField label="Unit ID" variant="outlined" size="small" sx={{ width: 70 }} />
        </Box>
        <Button onClick={testRead}>Connect</Button>
      </Box>

      <Paper sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          density="compact"
          rowHeight={40}
          columnHeaderHeight={48}
          sx={{
            '& .MuiDataGrid-virtualScrollerContent': {
              fontFamily: 'monospace',
              fontSize: '0.95em'
            },
            '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
              minHeight: 32,
              height: 32
            }
          }}
          autoHeight={false}
          checkboxSelection
        />
      </Paper>
    </Box>
  )
}

export default App

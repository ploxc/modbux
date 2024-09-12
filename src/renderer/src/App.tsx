import {
  Box,
  Button,
  FormControlLabel,
  Input,
  Paper,
  Radio,
  RadioGroup,
  styled,
  TextField
} from '@mui/material'
import { DataGrid, GridColDef } from '@mui/x-data-grid'
import { useRef, useState } from 'react'
import { Unstable_NumberInput as NumberInput, numberInputClasses } from '@mui/base'
import { useRootZustand } from './context/root.zustand'
import { blue, grey } from '@mui/material/colors'

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
  headerName: 'Address',
  width: 70,
  renderCell: ({ value }) => <Box sx={{ fontWeight: 'bold' }}>{value}</Box>
}

const hexColumn: GridColDef<RegisterData, string> = {
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
  key: keyof RegisterDataEndian,
  width: number
): GridColDef<RegisterData, RegisterDataEndian, RegisterDataEndian> => ({
  type: 'number',
  field: `${field}_${key}`,
  headerName: key.toUpperCase(),
  width,
  renderCell: ({ row }): JSX.Element => {
    const value = row[field][key]
    const { numberString, irrelevant } = registerValueToString(value)

    return <Box sx={{ opacity: irrelevant ? 0.25 : undefined }}>{numberString}</Box>
  }
})

const columns: GridColDef<RegisterData>[] = [
  addressColumn,
  hexColumn,
  valueColumn('bigEndian', 'int16', 70),
  valueColumn('bigEndian', 'uint16', 70),
  valueColumn('bigEndian', 'int32', 100),
  valueColumn('bigEndian', 'uint32', 100),
  valueColumn('bigEndian', 'int64', 160),
  valueColumn('bigEndian', 'uint64', 160),
  valueColumn('bigEndian', 'float', 200),
  valueColumn('bigEndian', 'double', 200)
]

function App(): JSX.Element {
  const [rows, setRows] = useState<RegisterData[]>([])
  const reading = useRef(false)

  const poll = async () => {
    const result = await window.api.read(0, 20)
    setRows(result)
    setTimeout(poll, 1000)
  }

  const testRead = async (): Promise<void> => {
    if (reading.current) return
    reading.current = true
    poll()
  }

  const [protocol, setProtocol] = useState<Protocol>('ModbusTcp')

  const port = useRootZustand((z) => z.connectionConfig.tcp.options.port)
  const setPort = useRootZustand((z) => z.setPort)

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
          <TextField
            type="number"
            label="Port"
            variant="outlined"
            size="small"
            sx={{ width: 70, mr: 2 }}
          />
          <TextField label="Unit ID" variant="outlined" size="small" sx={{ width: 70 }} />
          <Input type="number" slotProps={{ input: { step: 1 } }}></Input>
          <NumberInput
            slots={{
              root: StyledInputRoot,
              input: StyledInputElement,
              incrementButton: StyledButton,
              decrementButton: StyledButton
            }}
            slotProps={{
              incrementButton: {
                children: '▴'
              },
              decrementButton: {
                children: '▾'
              }
            }}
            value={port}
            onChange={(_, value) => value && setPort(value)}
          />
        </Box>
        <Button onClick={testRead}>Connect</Button>
      </Box>

      <Paper sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          autoHeight={false}
          density="compact"
          checkboxSelection
          rowHeight={40}
          columnHeaderHeight={48}
          sx={{
            '& .MuiDataGrid-virtualScrollerContent': {
              fontFamily: 'monospace',
              fontSize: '0.95em'
            },
            '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
              minHeight: 36,
              height: 36
            }
          }}
        />
      </Paper>
    </Box>
  )
}

export default App

const StyledInputRoot = styled('div')(
  ({ theme }) => `
  font-family: 'IBM Plex Sans', sans-serif;
  font-weight: 400;
  border-radius: 8px;
  color: ${theme.palette.mode === 'dark' ? grey[300] : grey[900]};
  background: ${theme.palette.mode === 'dark' ? grey[900] : '#fff'};
  border: 1px solid ${theme.palette.mode === 'dark' ? grey[700] : grey[200]};
  box-shadow: 0px 2px 4px ${
    theme.palette.mode === 'dark' ? 'rgba(0,0,0, 0.5)' : 'rgba(0,0,0, 0.05)'
  };
  display: grid;
  grid-template-columns: 1fr 19px;
  grid-template-rows: 1fr 1fr;
  overflow: hidden;
  column-gap: 8px;
  padding: 4px;

  &.${numberInputClasses.focused} {
    border-color: ${blue[400]};
    box-shadow: 0 0 0 3px ${theme.palette.mode === 'dark' ? blue[700] : blue[200]};
  }

  &:hover {
    border-color: ${blue[400]};
  }

  // firefox
  &:focus-visible {
    outline: 0;
  }
`
)

const StyledInputElement = styled('input')(
  ({ theme }) => `
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 400;
  line-height: 1.5;
  grid-column: 1/2;
  grid-row: 1/3;
  color: ${theme.palette.mode === 'dark' ? grey[300] : grey[900]};
  background: inherit;
  border: none;
  border-radius: inherit;
  padding: 8px 12px;
  outline: 0;
`
)

const StyledButton = styled('button')(
  ({ theme }) => `
  display: flex;
  flex-flow: row nowrap;
  justify-content: center;
  align-items: center;
  appearance: none;
  padding: 0;
  width: 19px;
  height: 19px;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
  line-height: 1;
  box-sizing: border-box;
  background: ${theme.palette.mode === 'dark' ? grey[900] : '#fff'};
  border: 0;
  color: ${theme.palette.mode === 'dark' ? grey[300] : grey[900]};
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 120ms;

  &:hover {
    background: ${theme.palette.mode === 'dark' ? grey[800] : grey[50]};
    border-color: ${theme.palette.mode === 'dark' ? grey[600] : grey[300]};
    cursor: pointer;
  }

  &.${numberInputClasses.incrementButton} {
    grid-column: 2/3;
    grid-row: 1/2;
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
    border: 1px solid;
    border-bottom: 0;
    border-color: ${theme.palette.mode === 'dark' ? grey[700] : grey[200]};
    background: ${theme.palette.mode === 'dark' ? grey[900] : grey[50]};
    color: ${theme.palette.mode === 'dark' ? grey[200] : grey[900]};

    &:hover {
      cursor: pointer;
      color: #FFF;
      background: ${theme.palette.mode === 'dark' ? blue[600] : blue[500]};
      border-color: ${theme.palette.mode === 'dark' ? blue[400] : blue[600]};
    }
  }

  &.${numberInputClasses.decrementButton} {
    grid-column: 2/3;
    grid-row: 2/3;
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    border: 1px solid;
    border-color: ${theme.palette.mode === 'dark' ? grey[700] : grey[200]};
    background: ${theme.palette.mode === 'dark' ? grey[900] : grey[50]};
    color: ${theme.palette.mode === 'dark' ? grey[200] : grey[900]};
  }

  &:hover {
    cursor: pointer;
    color: #FFF;
    background: ${theme.palette.mode === 'dark' ? blue[600] : blue[500]};
    border-color: ${theme.palette.mode === 'dark' ? blue[400] : blue[600]};
  }

  & .arrow {
    transform: translateY(-1px);
  }

  & .arrow {
    transform: translateY(-1px);
  }
`
)

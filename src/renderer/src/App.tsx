import {
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import { DataGrid, GridColDef } from '@mui/x-data-grid'
import { useEffect, useRef, useState } from 'react'
import { useRootZustand } from './context/root.zustand'
import HostInput from './components/HostInput'
import UIntInput from './components/UintInput'
import UnitIdInput from './components/UnitIdInput'
import { maskInputProps } from './components/types'
import { Protocol, RegisterData, RegisterDataEndian, RegisterType } from '@shared'
import { useSnackbar } from 'notistack'
import LengthInput from './components/LengthInput'

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

//
//
//
//
//
//
//
//
//
//
//

//
//
// Protocol
const ProtocolSelect = ({ protocol }: { protocol: Protocol }) => {
  const setProtocol = useRootZustand((z) => z.setProtocol)

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      color="primary"
      value={protocol}
      onChange={(_, v) => setProtocol(v)}
    >
      <ToggleButton value={Protocol.ModbusTcp}>TCP</ToggleButton>
      <ToggleButton value={Protocol.ModbusRtu}>RTU</ToggleButton>
    </ToggleButtonGroup>
  )
}

//
//
// Protocol
const TypeSelect = () => {
  const labelId = 'register-type-select'
  const type = useRootZustand((z) => z.registerConfig.type)
  const setType = useRootZustand((z) => z.setType)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Type</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        id="demo-select-small"
        value={type}
        label="Type"
        onChange={(e) => setType(e.target.value as RegisterType)}
      >
        <MenuItem value={RegisterType.Coils}>Coils</MenuItem>
        <MenuItem value={RegisterType.DiscreteInputs}>Discrete Inputs</MenuItem>
        <MenuItem value={RegisterType.InputRegisters}>Input Registers</MenuItem>
        <MenuItem value={RegisterType.HoldingRegisters}>Holding Registers</MenuItem>
      </Select>
    </FormControl>
  )
}

//
//
// Unit Id
const UnitId = () => {
  const unitId = useRootZustand((z) => String(z.connectionConfig.unitId))
  const setUnitId = useRootZustand((z) => z.setUnitId)

  return (
    <TextField
      label="Unit ID"
      variant="outlined"
      size="small"
      sx={{ width: 70 }}
      value={unitId}
      slotProps={{
        input: {
          inputComponent: UnitIdInput as any,
          inputProps: maskInputProps({ set: setUnitId })
        }
      }}
    />
  )
}

//
//
// Address
const Address = () => {
  const address = useRootZustand((z) => String(z.registerConfig.address))
  const type = useRootZustand((z) => z.registerConfig.type)
  const setAddress = useRootZustand((z) => z.setAddress)
  const addressBase = useRootZustand((z) => z.addressBase)
  const setAddressBase = useRootZustand((z) => z.setAddressBase)

  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    enqueueSnackbar({ message: `Type Updated to ${type}` })
  }, [type])

  return (
    <TextField
      label="Address"
      variant="outlined"
      size="small"
      sx={{ width: 160, '& .MuiInputBase-root': { pr: 0 } }}
      value={address}
      slotProps={{
        input: {
          inputComponent: UIntInput as any,
          inputProps: maskInputProps({ set: setAddress }),
          endAdornment: (
            <Box
              sx={(theme) => ({
                color: theme.palette.primary.light,
                display: 'flex',
                alignItems: 'center',
                gap: 1
              })}
            >
              <Tooltip
                arrow
                slotProps={{
                  tooltip: { sx: { p: 0, background: 'transparent', fontSize: 'inherit' } }
                }}
                title={
                  <Paper sx={{ px: 3, py: 2, width: 400 }}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                      This value only serves as a visual reference!
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="h6">Address Naming Convention</Typography>
                    <Typography variant="overline">(starting from 0)</Typography>
                    <ul>
                      <li>
                        <strong>Coils</strong>: 0 - 9999
                      </li>
                      <li>
                        <strong>Discrete Inputs</strong>: 10000 - 19999
                      </li>
                      <li>
                        <strong>Input Registers</strong>: 30000 - 39999
                      </li>
                      <li>
                        <strong>Holding Registers</strong>: 40000 - 49999
                      </li>
                    </ul>
                    <Typography variant="body1">
                      Each register type in Modbus can theoretically address up to 65,536 locations
                      (0 - 65535). The numbering convention (e.g., 40000/40001 for holding
                      registers) is commonly used in documentation but doesn't always match the
                      internal Modbus protocol addresses. For example, a holding register at address
                      0 in Modbus might be referred to as 40000 or 40001 by some manufacturers,
                      while others may use 0 directly. The actual addressing and naming depend on
                      the manufacturer's implementation.
                    </Typography>
                  </Paper>
                }
              >
                <Box>
                  {type === RegisterType.DiscreteInputs
                    ? Number(address) + 10000 + Number(addressBase)
                    : type === RegisterType.HoldingRegisters
                      ? Number(address) + 40000 + Number(addressBase)
                      : type === RegisterType.InputRegisters
                        ? Number(address) + 10000 + Number(addressBase)
                        : Number(address) + Number(addressBase)}
                </Box>
              </Tooltip>
              <ToggleButtonGroup
                size="small"
                exclusive
                color="primary"
                value={addressBase}
                onChange={(_, v) => setAddressBase(v)}
              >
                <ToggleButton value={'0'}>0</ToggleButton>
                <ToggleButton value={'1'}>1</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )
        }
      }}
    />
  )
}

//
//
// Length
const Length = () => {
  const length = useRootZustand((z) => String(z.registerConfig.length))
  const setLength = useRootZustand((z) => z.setLength)

  return (
    <TextField
      label="Length"
      variant="outlined"
      size="small"
      sx={{ width: 70 }}
      value={length}
      slotProps={{
        input: {
          inputComponent: LengthInput as any,
          inputProps: maskInputProps({ set: setLength })
        }
      }}
    />
  )
}

const AddresLength = () => {
  return (
    <Box sx={{ display: 'flex', gap: 2, marginRight: 'auto' }}>
      <Address />
      <Length />
    </Box>
  )
}

//
//
// Host
const Host = () => {
  const host = useRootZustand((z) => z.connectionConfig.tcp.host)
  const hostValid = useRootZustand((z) => z.valid.host)
  const setHost = useRootZustand((z) => z.setHost)
  return (
    <TextField
      label="IP Address"
      variant="outlined"
      size="small"
      sx={{ width: 130 }}
      error={!hostValid}
      value={host}
      slotProps={{
        input: {
          inputComponent: HostInput as any,
          inputProps: maskInputProps({ set: setHost })
        }
      }}
      onBlur={async () => {
        // On blur, make sure the host is synced with the server
        const connectionConfig = await window.api.getConnectionConfig()
        setHost(connectionConfig.tcp.host, true)
      }}
    />
  )
}

//
//
// Port
const Port = () => {
  const port = useRootZustand((z) => String(z.connectionConfig.tcp.options.port))
  const setPort = useRootZustand((z) => z.setPort)

  return (
    <TextField
      label="Port"
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={port}
      slotProps={{
        input: {
          inputComponent: UIntInput as any,
          inputProps: maskInputProps({ set: setPort })
        }
      }}
    />
  )
}

const HostPort = () => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'no-wrap' }}>
      <Host />
      <Box sx={{ display: 'flex', fontSize: 20, alignItems: 'center', pb: 0.5, px: 0.75 }}>:</Box>
      <Port />
    </Box>
  )
}

const App = (): JSX.Element => {
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

  //
  //
  // Protocol
  const protocol = useRootZustand((z) => z.connectionConfig.protocol)

  //
  //
  // Component
  return (
    <Box
      sx={{
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100dvh',
        width: '100dvw'
      }}
    >
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Box sx={{ display: 'flex', width: '100%', gap: 2, flexWrap: 'wrap' }}>
          <UnitId />
          <TypeSelect />
          <AddresLength />

          {protocol === 'ModbusTcp' ? <HostPort /> : <Box>RTU TODO</Box>}
          <ProtocolSelect protocol={protocol} />
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
          hideFooterPagination
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

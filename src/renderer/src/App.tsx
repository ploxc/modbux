import { Box, Button, Paper, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { DataGrid, GridColDef } from '@mui/x-data-grid'
import { useRef, useState } from 'react'
import { useRootZustand } from './context/root.zustand'
import HostInput from './components/HostInput'
import UIntInput from './components/UintInput'
import UnitIdInput from './components/UnitIdInput'
import { maskInputProps } from './components/types'
import { Protocol, RegisterData, RegisterDataEndian } from '@shared'

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
  const setAddress = useRootZustand((z) => z.setAddress)

  return (
    <TextField
      label="Address"
      variant="outlined"
      size="small"
      sx={{ width: 70 }}
      value={address}
      slotProps={{
        input: {
          inputComponent: UIntInput as any,
          inputProps: maskInputProps({ set: setAddress })
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
          inputComponent: UIntInput as any,
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
          <ProtocolSelect protocol={protocol} />
          <UnitId />
          <AddresLength />
          {protocol === 'ModbusTcp' ? <HostPort /> : <Box>RTU TODO</Box>}
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

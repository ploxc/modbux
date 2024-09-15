import { Box, FormControl, InputLabel, MenuItem, Select, TextField } from '@mui/material'
import ComInput from '@renderer/components/ComInput'
import { maskInputProps } from '@renderer/components/types'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ModbusBaudRate } from '@shared'
import { SerialPortOptions } from 'modbus-serial/ModbusRTU'

// COM Port
const Com = () => {
  const com = useRootZustand((z) => z.connectionConfig.rtu.com)
  const comValid = useRootZustand((z) => z.valid.com)
  const setCom = useRootZustand((z) => z.setCom)

  return (
    <TextField
      label="COM Port"
      variant="outlined"
      size="small"
      sx={{ width: 130 }}
      error={!comValid}
      value={com}
      slotProps={{
        input: {
          inputComponent: ComInput as any,
          inputProps: maskInputProps({ set: setCom })
        }
      }}
      onBlur={async () => {
        // On blur, make sure the host is synced with the server
        const connectionConfig = await window.api.getConnectionConfig()
        setCom(connectionConfig.rtu.com, true)
      }}
    />
  )
}

//
//
// Baud Rate
const BaudRateSelect = () => {
  const labelId = 'baud-rate-select'
  const baudRate = useRootZustand((z) => z.connectionConfig.rtu.options.baudRate)
  const setBaudRate = useRootZustand((z) => z.setBaudRate)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Baud Rate</InputLabel>

      <Select
        size="small"
        labelId={labelId}
        value={baudRate}
        label="Baud Rate"
        onChange={(e) => setBaudRate(Number(e.target.value) as ModbusBaudRate)}
        sx={{ width: 100 }}
      >
        {Object.entries(ModbusBaudRate).map(([key, value]) => {
          if (typeof value === 'string') return null
          return (
            <MenuItem key={`baud_rate_${key}`} value={value}>
              {value}
            </MenuItem>
          )
        })}
      </Select>
    </FormControl>
  )
}

//
//
// Parity
const parityOptions: SerialPortOptions['parity'][] = ['none', 'even', 'odd', 'mark', 'space']
const ParitySelect = () => {
  const labelId = 'parity-select'
  const parity = useRootZustand((z) => z.connectionConfig.rtu.options.parity)
  const setParity = useRootZustand((z) => z.setParity)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Parity</InputLabel>

      <Select
        size="small"
        labelId={labelId}
        value={parity}
        label="Parity"
        onChange={(e) => setParity(e.target.value as SerialPortOptions['parity'])}
        sx={{ width: 85 }}
      >
        {parityOptions.map((option) => (
          <MenuItem key={`parity_${option}`} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

//
//
// Data Bits
const databitsOptions: SerialPortOptions['dataBits'][] = [8, 7, 6, 5]

const DataBitsSelect = () => {
  const labelId = 'databits-select'
  const dataBits = useRootZustand((z) => z.connectionConfig.rtu.options.dataBits)
  const setDataBits = useRootZustand((z) => z.setDataBits)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Data Bits</InputLabel>

      <Select
        size="small"
        labelId={labelId}
        value={dataBits}
        label="Data Bits"
        onChange={(e) => setDataBits(Number(e.target.value))}
        sx={{ width: 75 }}
      >
        {databitsOptions.map((option) => (
          <MenuItem key={`databits_${option}`} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

//
//
// Stop Bits
const StopBitsOptions: SerialPortOptions['stopBits'][] = [1, 2]
const StopBitsSelect = () => {
  const labelId = 'stopbits-select'
  const stopBits = useRootZustand((z) => z.connectionConfig.rtu.options.stopBits)
  const setStopBits = useRootZustand((z) => z.setStopBits)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Stop Bits</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        value={stopBits}
        label="Stop Bits"
        onChange={(e) => setStopBits(Number(e.target.value))}
        sx={{ width: 75 }}
      >
        {StopBitsOptions.map((option) => (
          <MenuItem key={`stopbits_${option}`} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

const RtuConfig = () => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'no-wrap', gap: 2 }}>
        <Com />
        <BaudRateSelect />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'no-wrap', gap: 2 }}>
        <ParitySelect />
        <DataBitsSelect />
        <StopBitsSelect />
      </Box>
    </Box>
  )
}
export default RtuConfig

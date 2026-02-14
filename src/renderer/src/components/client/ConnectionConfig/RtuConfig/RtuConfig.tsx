import {
  Autocomplete,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import { CheckCircleOutline, Refresh } from '@mui/icons-material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ModbusBaudRate, ModbusBaudRateSchema } from '@shared'
import { SerialPortOptions } from 'modbus-serial/ModbusRTU'
import { AutocompleteRenderInputParams } from '@mui/material'
import { useSnackbar } from 'notistack'
import { useEffect, useMemo } from 'react'

const measureTextWidth = (text: string, font: string = '400 14px Roboto, sans-serif'): number => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context) {
    context.font = font
    return context.measureText(text).width
  }
  return 0
}

const ComTextField = meme((params: AutocompleteRenderInputParams) => {
  const comValid = useRootZustand((z) => z.valid.com)
  const loading = useRootZustand((z) => z.serialPortsLoading)

  return (
    <TextField
      {...params}
      label="COM Port"
      variant="outlined"
      size="small"
      sx={{
        '& .MuiOutlinedInput-root': {
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0
        }
      }}
      error={!comValid}
      slotProps={{
        input: {
          ...params.InputProps,
          endAdornment: (
            <>
              {loading ? <CircularProgress size={16} /> : null}
              {params.InputProps.endAdornment}
            </>
          )
        }
      }}
    />
  )
})

//
//
// COM Port Option
const ComOption = meme(
  ({ option, ...props }: { option: string } & React.HTMLAttributes<HTMLLIElement>) => {
    const manufacturer = useRootZustand(
      (z) => z.serialPorts.find((p) => p.path === option)?.manufacturer
    )

    return (
      <li {...props} key={option}>
        <Box>
          <Box>{option}</Box>
          {manufacturer && (
            <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{manufacturer}</Box>
          )}
        </Box>
      </li>
    )
  }
)

//
//
// COM Port Input
const ComInput = meme(() => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')
  const com = useRootZustand((z) => z.connectionConfig.rtu.com)
  const ports = useRootZustand((z) => z.serialPorts)

  const inputWidth = useMemo(() => {
    let textWidth = 60

    for (const port of ports) {
      const newTextWidth = measureTextWidth(port.path || 'COM Port')
      if (newTextWidth > textWidth) textWidth = newTextWidth
    }

    return Math.max(60, textWidth + 60)
  }, [ports])

  return (
    <Autocomplete
      freeSolo
      disabled={disabled}
      options={ports.map((p) => p.path)}
      value={com}
      data-testid="rtu-com-input"
      onInputChange={(_event, newValue) =>
        useRootZustand.getState().setCom(newValue, newValue.trim().length > 0)
      }
      onChange={(_event, newValue) => {
        if (newValue) useRootZustand.getState().setCom(newValue, true)
      }}
      sx={{ width: inputWidth }}
      renderInput={(params) => <ComTextField {...params} />}
      renderOption={(props, option) => <ComOption {...props} option={option} />}
    />
  )
})

//
//
// COM Port Actions
const ComActions = meme(() => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')
  const com = useRootZustand((z) => z.connectionConfig.rtu.com)
  const loading = useRootZustand((z) => z.serialPortsLoading)
  const validating = useRootZustand((z) => z.serialPortValidating)
  const { enqueueSnackbar } = useSnackbar()

  const onRefresh = (): void => {
    useRootZustand.getState().refreshSerialPorts()
  }

  const onValidate = async (): Promise<void> => {
    if (!com || com.trim() === '') return
    const result = await useRootZustand.getState().validateSerialPort(com)
    useRootZustand.getState().setCom(com, result.valid)
    enqueueSnackbar({
      message: result.message,
      variant: result.valid ? 'success' : 'warning'
    })
  }

  return (
    <ToggleButtonGroup
      size="small"
      disabled={disabled}
      sx={{
        '& .MuiToggleButton-root:first-of-type': {
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderLeft: 'none'
        }
      }}
    >
      <ToggleButton
        value="refresh"
        onClick={onRefresh}
        disabled={disabled || loading}
        data-testid="rtu-refresh-btn"
        aria-label="Refresh COM ports"
        title="Refresh COM ports"
      >
        {loading ? <CircularProgress size={16} /> : <Refresh fontSize="small" />}
      </ToggleButton>
      <ToggleButton
        value="validate"
        onClick={onValidate}
        disabled={disabled || validating || !com || com.trim() === ''}
        data-testid="rtu-validate-btn"
        aria-label="Validate COM port"
        title="Validate COM port"
      >
        {validating ? <CircularProgress size={16} /> : <CheckCircleOutline fontSize="small" />}
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

//
//
// COM Port (composite)
const Com = (): JSX.Element => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')

  useEffect(() => {
    if (!disabled) useRootZustand.getState().refreshSerialPorts()
  }, [disabled])

  return (
    <Box sx={{ display: 'flex' }}>
      <ComInput />
      <ComActions />
    </Box>
  )
}

//
//
// Baud Rate
const BaudRateSelect = meme(() => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')

  const labelId = 'baud-rate-select'
  const baudRate = useRootZustand((z) => z.connectionConfig.rtu.options.baudRate)
  const setBaudRate = useRootZustand((z) => z.setBaudRate)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Baud Rate</InputLabel>

      <Select
        disabled={disabled}
        size="small"
        labelId={labelId}
        value={baudRate}
        label="Baud Rate"
        onChange={(e) => setBaudRate(e.target.value as ModbusBaudRate)}
        sx={{ width: 100 }}
        data-testid="rtu-baudrate-select"
      >
        {ModbusBaudRateSchema.options.map((value) => (
          <MenuItem key={`baud_rate_${value}`} value={value}>
            {value}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

//
//
// Parity
const parityOptions: SerialPortOptions['parity'][] = ['none', 'even', 'odd', 'mark', 'space']

const ParitySelect = meme(() => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')

  const labelId = 'parity-select'
  const parity = useRootZustand((z) => z.connectionConfig.rtu.options.parity)
  const setParity = useRootZustand((z) => z.setParity)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Parity</InputLabel>

      <Select
        disabled={disabled}
        size="small"
        labelId={labelId}
        value={parity}
        label="Parity"
        onChange={(e) => setParity(e.target.value as SerialPortOptions['parity'])}
        sx={{ width: 85 }}
        data-testid="rtu-parity-select"
      >
        {parityOptions.map((option) => (
          <MenuItem key={`parity_${option}`} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

//
//
// Data Bits
const databitsOptions: SerialPortOptions['dataBits'][] = [8, 7, 6, 5]

const DataBitsSelect = meme(() => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')

  const labelId = 'databits-select'
  const dataBits = useRootZustand((z) => z.connectionConfig.rtu.options.dataBits)
  const setDataBits = useRootZustand((z) => z.setDataBits)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Data Bits</InputLabel>

      <Select
        disabled={disabled}
        size="small"
        labelId={labelId}
        value={dataBits}
        label="Data Bits"
        onChange={(e) => setDataBits(Number(e.target.value))}
        sx={{ width: 75 }}
        data-testid="rtu-databits-select"
      >
        {databitsOptions.map((option) => (
          <MenuItem key={`databits_${option}`} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

//
//
// Stop Bits
const StopBitsOptions: SerialPortOptions['stopBits'][] = [1, 2]
const StopBitsSelect = meme(() => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')

  const labelId = 'stopbits-select'
  const stopBits = useRootZustand((z) => z.connectionConfig.rtu.options.stopBits)
  const setStopBits = useRootZustand((z) => z.setStopBits)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Stop Bits</InputLabel>
      <Select
        disabled={disabled}
        size="small"
        labelId={labelId}
        value={stopBits}
        label="Stop Bits"
        onChange={(e) => setStopBits(Number(e.target.value))}
        sx={{ width: 75 }}
        data-testid="rtu-stopbits-select"
      >
        {StopBitsOptions.map((option) => (
          <MenuItem key={`stopbits_${option}`} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

const RtuConfig = (): JSX.Element => {
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

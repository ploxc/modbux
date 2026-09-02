import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import Refresh from '@mui/icons-material/Refresh'
import { meme } from '@renderer/components/shared/inputs/meme'
import {
  BaudRateSelect,
  ComOption,
  ComTextField,
  DataBitsSelect,
  ParitySelect,
  StopBitsSelect,
  useComInputWidth
} from '@renderer/components/shared/inputs/SerialPortInputs'
import { useClientZustand } from '@renderer/context/client.zustand'
import type { ModbusBaudRate } from '@shared'
import type { SerialPortOptions } from 'modbus-serial/ModbusRTU'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect } from 'react'

//
//
// COM Port Input
const ComInput = meme(() => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')
  const com = useClientZustand((z) => z.connectionConfig.rtu.com)
  const comValid = useClientZustand((z) => z.valid.com)
  const loading = useClientZustand((z) => z.serialPortsLoading)
  const ports = useClientZustand((z) => z.serialPorts)
  const inputWidth = useComInputWidth(ports)

  return (
    <Autocomplete
      freeSolo
      disabled={disabled}
      options={ports.map((p) => p.path)}
      value={com}
      data-testid="rtu-com-input"
      onInputChange={(_event, newValue) =>
        useClientZustand.getState().setCom(newValue, newValue.trim().length > 0)
      }
      onChange={(_event, newValue) => {
        if (newValue) useClientZustand.getState().setCom(newValue, true)
      }}
      sx={{ width: inputWidth, maxWidth: 220 }}
      renderInput={(params) => (
        <ComTextField {...params} comLabel="COM Port" comError={!comValid} comLoading={loading} />
      )}
      renderOption={(props, option) => {
        const manufacturer = ports.find((p) => p.path === option)?.manufacturer
        return <ComOption {...props} option={option} manufacturer={manufacturer} />
      }}
    />
  )
})

//
//
// COM Port Actions
const ComActions = meme(() => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')
  const com = useClientZustand((z) => z.connectionConfig.rtu.com)
  const loading = useClientZustand((z) => z.serialPortsLoading)
  const validating = useClientZustand((z) => z.serialPortValidating)
  const { enqueueSnackbar } = useSnackbar()

  const onRefresh = (): void => {
    useClientZustand.getState().refreshSerialPorts()
  }

  const onValidate = async (): Promise<void> => {
    if (!com || com.trim() === '') return
    const result = await useClientZustand.getState().validateSerialPort(com)
    useClientZustand.getState().setCom(com, result.valid)
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
        sx={{ width: 32 }}
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
        sx={{ width: 32 }}
      >
        {validating ? <CircularProgress size={16} /> : <CheckCircleOutlined fontSize="small" />}
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

//
//
// COM Port (composite)
const Com = meme((): JSX.Element => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')

  useEffect(() => {
    if (!disabled) useClientZustand.getState().refreshSerialPorts()
  }, [disabled])

  return (
    <Box sx={{ display: 'flex' }}>
      <ComInput />
      <ComActions />
    </Box>
  )
})

//
//
// Selects (thin wrappers over shared components)
const ClientBaudRateSelect = meme(() => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')
  const baudRate = useClientZustand((z) => z.connectionConfig.rtu.options.baudRate)

  const handleChange = useCallback((value: ModbusBaudRate): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setBaudRate(value)
  }, [])

  return <BaudRateSelect value={baudRate} onChange={handleChange} disabled={disabled} />
})

const ClientParitySelect = meme(() => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')
  const parity = useClientZustand((z) => z.connectionConfig.rtu.options.parity ?? 'none')

  const handleChange = useCallback((value: string): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setParity(value as SerialPortOptions['parity'])
  }, [])

  return <ParitySelect value={parity} onChange={handleChange} disabled={disabled} />
})

const ClientDataBitsSelect = meme(() => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')
  const dataBits = useClientZustand((z) => z.connectionConfig.rtu.options.dataBits)

  const handleChange = useCallback((value: number): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setDataBits(value as SerialPortOptions['dataBits'])
  }, [])

  return <DataBitsSelect value={dataBits} onChange={handleChange} disabled={disabled} />
})

const ClientStopBitsSelect = meme(() => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')
  const stopBits = useClientZustand((z) => z.connectionConfig.rtu.options.stopBits)

  const handleChange = useCallback((value: number): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setStopBits(value as SerialPortOptions['stopBits'])
  }, [])

  return <StopBitsSelect value={stopBits} onChange={handleChange} disabled={disabled} />
})

const RtuConfig = meme((): JSX.Element => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      <Box sx={{ display: 'flex', flexWrap: 'no-wrap', gap: 1 }}>
        <Com />
        <ClientBaudRateSelect />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'no-wrap', gap: 1 }}>
        <ClientParitySelect />
        <ClientDataBitsSelect />
        <ClientStopBitsSelect />
      </Box>
    </Box>
  )
})
export default RtuConfig

import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { alpha } from '@mui/material/styles'
import Refresh from '@mui/icons-material/Refresh'
import Usb from '@mui/icons-material/Usb'
import UsbOff from '@mui/icons-material/UsbOff'
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
import { useServerZustand } from '@renderer/context/server.zustand'
import { ModbusBaudRate } from '@shared'
import React, { useCallback, useEffect, useState } from 'react'

//
//
// COM Port Input (onBlur pattern)
const ComInput = meme(() => {
  const comFromStore = useServerZustand((z) => z.serialConfig?.com ?? '')
  const loading = useServerZustand((z) => z.serverSerialPortsLoading)
  const ports = useServerZustand((z) => z.serverSerialPorts)
  const [localCom, setLocalCom] = useState(comFromStore)
  const inputWidth = useComInputWidth(ports)

  // Sync local with store when store changes externally
  React.useEffect(() => {
    setLocalCom(comFromStore)
  }, [comFromStore])

  const applyOnBlur = (): void => {
    const serverZustand = useServerZustand.getState()
    if (localCom !== comFromStore) {
      serverZustand.setServerCom(localCom)
      serverZustand.applyServerCom()
    }
  }

  // Picking from the dropdown applies at once; typing waits for the blur.
  const handleChange = useCallback((_event: unknown, value: string | null): void => {
    if (!value) return
    const serverZustand = useServerZustand.getState()
    setLocalCom(value)
    serverZustand.setServerCom(value)
    serverZustand.applyServerCom()
  }, [])

  const comLabel = comFromStore ? `COM ${comFromStore}` : 'COM Port'
  const comError = !comFromStore || comFromStore.trim().length === 0

  return (
    <Autocomplete
      freeSolo
      options={ports.map((p) => p.path)}
      value={localCom}
      data-testid="server-rtu-com-input"
      onInputChange={(_event, newValue) => setLocalCom(newValue)}
      onChange={handleChange}
      onBlur={applyOnBlur}
      sx={{ width: inputWidth, maxWidth: 220 }}
      renderInput={(params) => (
        <ComTextField {...params} comLabel={comLabel} comError={comError} comLoading={loading} />
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
// RTU Status Dot
const RtuStatus = meme(() => {
  const active = useServerZustand((z) => z.rtuServerActive)
  const [hovered, setHovered] = useState(false)

  const handleClick = (): void => {
    useServerZustand.getState().applyServerCom()
  }

  return (
    <Box
      data-testid="server-rtu-status"
      title={active ? 'RTU server active' : 'RTU server inactive'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      sx={(theme) => ({
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ml: 1,
        mr: -1,
        flexShrink: 0,
        width: 28,
        height: 28,
        borderRadius: 28,
        cursor: 'pointer',
        backgroundColor: active
          ? alpha(theme.palette.success.main, 0.1)
          : alpha(theme.palette.text.primary, 0.08)
      })}
    >
      {hovered ? (
        <Refresh fontSize="small" color={active ? 'success' : 'inherit'} />
      ) : active ? (
        <Usb color="success" fontSize="small" />
      ) : (
        <UsbOff fontSize="small" />
      )}
    </Box>
  )
})

//
//
// COM Port Actions
const ComActions = meme(() => {
  const loading = useServerZustand((z) => z.serverSerialPortsLoading)

  const onRefresh = (): void => {
    useServerZustand.getState().refreshServerSerialPorts()
  }

  return (
    <ToggleButtonGroup
      size="small"
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
        disabled={loading}
        data-testid="server-rtu-refresh-btn"
        aria-label="Refresh COM ports"
        title="Refresh COM ports"
        sx={{ width: 32 }}
      >
        {loading ? <CircularProgress size={16} /> : <Refresh fontSize="small" />}
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

//
//
// COM Port (composite)
const Com = meme((): JSX.Element => {
  useEffect(() => {
    useServerZustand.getState().refreshServerSerialPorts()
  }, [])

  return (
    <Box sx={{ display: 'flex' }}>
      <ComInput />
      <ComActions />
      <RtuStatus />
    </Box>
  )
})

//
//
// Selects (thin wrappers over shared components)
const ServerBaudRateSelect = meme(() => {
  const baudRate = useServerZustand((z) => z.serialConfig?.options.baudRate ?? '9600')

  const handleChange = useCallback((value: ModbusBaudRate): void => {
    const serverZustand = useServerZustand.getState()
    serverZustand.setServerBaudRate(value)
  }, [])

  return (
    <BaudRateSelect
      value={baudRate as ModbusBaudRate}
      onChange={handleChange}
      testId="server-rtu-baudrate-select"
    />
  )
})

const ServerParitySelect = meme(() => {
  const parity = useServerZustand((z) => z.serialConfig?.options.parity ?? 'none')

  const handleChange = useCallback((value: string): void => {
    const serverZustand = useServerZustand.getState()
    serverZustand.setServerParity(value)
  }, [])

  return <ParitySelect value={parity} onChange={handleChange} testId="server-rtu-parity-select" />
})

const ServerDataBitsSelect = meme(() => {
  const dataBits = useServerZustand((z) => z.serialConfig?.options.dataBits ?? 8)

  const handleChange = useCallback((value: number): void => {
    const serverZustand = useServerZustand.getState()
    serverZustand.setServerDataBits(value)
  }, [])

  return (
    <DataBitsSelect value={dataBits} onChange={handleChange} testId="server-rtu-databits-select" />
  )
})

const ServerStopBitsSelect = meme(() => {
  const stopBits = useServerZustand((z) => z.serialConfig?.options.stopBits ?? 1)

  const handleChange = useCallback((value: number): void => {
    const serverZustand = useServerZustand.getState()
    serverZustand.setServerStopBits(value)
  }, [])

  return (
    <StopBitsSelect value={stopBits} onChange={handleChange} testId="server-rtu-stopbits-select" />
  )
})

const ServerRtuConfig = meme((): JSX.Element => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 2 }}>
        <Com />
        <ServerBaudRateSelect />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 2 }}>
        <ServerParitySelect />
        <ServerDataBitsSelect />
        <ServerStopBitsSelect />
      </Box>
    </Box>
  )
})

export default ServerRtuConfig

import {
  alpha,
  Autocomplete,
  Box,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import { Refresh, Usb, UsbOff } from '@mui/icons-material'
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
import React, { useEffect, useState } from 'react'

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
    if (localCom !== comFromStore) {
      useServerZustand.getState().setServerCom(localCom)
      useServerZustand.getState().applyServerCom()
    }
  }

  const comLabel = comFromStore ? `COM ${comFromStore}` : 'COM Port'
  const comError = !comFromStore || comFromStore.trim().length === 0

  return (
    <Autocomplete
      freeSolo
      options={ports.map((p) => p.path)}
      value={localCom}
      data-testid="server-rtu-com-input"
      onInputChange={(_event, newValue) => setLocalCom(newValue)}
      onChange={(_event, newValue) => {
        if (newValue) {
          setLocalCom(newValue)
          // Dropdown selection: apply immediately
          useServerZustand.getState().setServerCom(newValue)
          useServerZustand.getState().applyServerCom()
        }
      }}
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
  return (
    <Box
      data-testid="server-rtu-status"
      title={active ? 'RTU server active' : 'RTU server inactive'}
      sx={(theme) => ({
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ml: 1,
        mr: -1,
        flexShrink: 0,
        width: 24,
        height: 24,
        borderRadius: 24,
        backgroundColor: active
          ? alpha(theme.palette.success.main, 0.1)
          : alpha(theme.palette.text.primary, 0.08)
      })}
    >
      {active ? <Usb color="success" fontSize={'small'} /> : <UsbOff fontSize="small" />}
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
const Com = (): JSX.Element => {
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
}

//
//
// Selects (thin wrappers over shared components)
const ServerBaudRateSelect = meme(() => {
  const baudRate = useServerZustand((z) => z.serialConfig?.options.baudRate ?? '9600')

  return (
    <BaudRateSelect
      value={baudRate as ModbusBaudRate}
      onChange={(v) => useServerZustand.getState().setServerBaudRate(v)}
      testId="server-rtu-baudrate-select"
    />
  )
})

const ServerParitySelect = meme(() => {
  const parity = useServerZustand((z) => z.serialConfig?.options.parity ?? 'none')

  return (
    <ParitySelect
      value={parity}
      onChange={(v) => useServerZustand.getState().setServerParity(v)}
      testId="server-rtu-parity-select"
    />
  )
})

const ServerDataBitsSelect = meme(() => {
  const dataBits = useServerZustand((z) => z.serialConfig?.options.dataBits ?? 8)

  return (
    <DataBitsSelect
      value={dataBits}
      onChange={(v) => useServerZustand.getState().setServerDataBits(v)}
      testId="server-rtu-databits-select"
    />
  )
})

const ServerStopBitsSelect = meme(() => {
  const stopBits = useServerZustand((z) => z.serialConfig?.options.stopBits ?? 1)

  return (
    <StopBitsSelect
      value={stopBits}
      onChange={(v) => useServerZustand.getState().setServerStopBits(v)}
      testId="server-rtu-stopbits-select"
    />
  )
})

const ServerRtuConfig = (): JSX.Element => {
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
}

export default ServerRtuConfig

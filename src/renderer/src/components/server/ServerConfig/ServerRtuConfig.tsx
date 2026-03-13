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
import { Refresh } from '@mui/icons-material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useServerZustand } from '@renderer/context/server.zustand'
import { ModbusBaudRate, ModbusBaudRateSchema } from '@shared'
import { AutocompleteRenderInputParams } from '@mui/material'
import React, { useEffect, useMemo, useState } from 'react'

const measureTextWidth = (
  text: string,
  font: string = '400 0.85rem Roboto, sans-serif'
): number => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context) {
    context.font = font
    return context.measureText(text).width
  }
  return 0
}

const ComTextField = meme(
  (params: AutocompleteRenderInputParams & { comLabel: string; comError: boolean }) => {
    const { comLabel, comError, ...rest } = params
    const loading = useServerZustand((z) => z.serverSerialPortsLoading)

    return (
      <TextField
        {...rest}
        label={comLabel}
        variant="outlined"
        size="small"
        title={rest.inputProps.value as string}
        error={comError}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0
          },
          '& .MuiOutlinedInput-input': {
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }
        }}
        slotProps={{
          input: {
            ...rest.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress size={16} /> : null}
                {rest.InputProps.endAdornment}
              </>
            )
          }
        }}
      />
    )
  }
)

const ComOption = meme(
  ({ option, ...props }: { option: string } & React.HTMLAttributes<HTMLLIElement>) => {
    const manufacturer = useServerZustand(
      (z) => z.serverSerialPorts.find((p) => p.path === option)?.manufacturer
    )

    return (
      <li {...props} key={option}>
        <Box sx={{ width: '100%' }} title={option}>
          <Box
            sx={{
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              width: '100%'
            }}
          >
            {option}
          </Box>
          {manufacturer && (
            <Box
              sx={{
                fontSize: '0.75rem',
                color: 'text.secondary',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                width: '100%'
              }}
            >
              {manufacturer}
            </Box>
          )}
        </Box>
      </li>
    )
  }
)

const ComInput = meme(() => {
  const comFromStore = useServerZustand((z) => z.serialConfig?.com ?? '')
  const ports = useServerZustand((z) => z.serverSerialPorts)
  const [localCom, setLocalCom] = useState(comFromStore)

  // Sync local with store when store changes externally
  React.useEffect(() => {
    setLocalCom(comFromStore)
  }, [comFromStore])

  const inputWidth = useMemo(() => {
    let textWidth = 60
    for (const port of ports) {
      const newTextWidth = measureTextWidth(port.path || 'COM Port')
      if (newTextWidth > textWidth) textWidth = newTextWidth
    }
    return Math.max(60, textWidth + 60)
  }, [ports])

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
      renderInput={(params) => <ComTextField {...params} comLabel={comLabel} comError={comError} />}
      renderOption={(props, option) => <ComOption {...props} option={option} />}
    />
  )
})

const RtuStatus = meme(() => {
  const active = useServerZustand((z) => z.rtuServerActive)
  return (
    <Box
      data-testid="server-rtu-status"
      title={active ? 'RTU server active' : 'RTU server inactive'}
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: active ? 'success.main' : 'action.disabled',
        alignSelf: 'center',
        ml: 0.5,
        flexShrink: 0
      }}
    />
  )
})

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

const Com = (): JSX.Element => {
  useEffect(() => {
    useServerZustand.getState().refreshServerSerialPorts()
  }, [])

  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <ComInput />
      <ComActions />
      <RtuStatus />
    </Box>
  )
}

const BaudRateSelect = meme(() => {
  const labelId = 'server-baud-rate-select'
  const baudRate = useServerZustand((z) => z.serialConfig?.options.baudRate ?? '9600')

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Baud Rate</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        value={baudRate}
        label="Baud Rate"
        onChange={(e) =>
          useServerZustand.getState().setServerBaudRate(e.target.value as ModbusBaudRate)
        }
        sx={{ width: 100 }}
        data-testid="server-rtu-baudrate-select"
      >
        {ModbusBaudRateSchema.options.map((value) => (
          <MenuItem key={`server_baud_rate_${value}`} value={value}>
            {value}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

const parityOptions = ['none', 'even', 'odd', 'mark', 'space'] as const

const ParitySelect = meme(() => {
  const labelId = 'server-parity-select'
  const parity = useServerZustand((z) => z.serialConfig?.options.parity ?? 'none')

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Parity</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        value={parity}
        label="Parity"
        onChange={(e) => useServerZustand.getState().setServerParity(e.target.value)}
        sx={{ width: 85 }}
        data-testid="server-rtu-parity-select"
      >
        {parityOptions.map((option) => (
          <MenuItem key={`server_parity_${option}`} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

const databitsOptions = [8, 7, 6, 5] as const

const DataBitsSelect = meme(() => {
  const labelId = 'server-databits-select'
  const dataBits = useServerZustand((z) => z.serialConfig?.options.dataBits ?? 8)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Data</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        value={dataBits}
        label="Data Bits"
        onChange={(e) => useServerZustand.getState().setServerDataBits(Number(e.target.value))}
        sx={{ width: 55 }}
        data-testid="server-rtu-databits-select"
      >
        {databitsOptions.map((option) => (
          <MenuItem key={`server_databits_${option}`} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

const stopBitsOptions = [1, 2] as const

const StopBitsSelect = meme(() => {
  const labelId = 'server-stopbits-select'
  const stopBits = useServerZustand((z) => z.serialConfig?.options.stopBits ?? 1)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Stop</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        value={stopBits}
        label="Stop Bits"
        onChange={(e) => useServerZustand.getState().setServerStopBits(Number(e.target.value))}
        sx={{ width: 55 }}
        data-testid="server-rtu-stopbits-select"
      >
        {stopBitsOptions.map((option) => (
          <MenuItem key={`server_stopbits_${option}`} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

const ServerRtuConfig = (): JSX.Element => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 2 }}>
        <Com />
        <BaudRateSelect />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 2 }}>
        <ParitySelect />
        <DataBitsSelect />
        <StopBitsSelect />
      </Box>
    </Box>
  )
}

export default ServerRtuConfig

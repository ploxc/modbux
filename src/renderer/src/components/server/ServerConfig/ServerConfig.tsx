//
//

import FormControl from '@mui/material/FormControl'
import {
  TextField,
  Box,
  InputBaseComponentProps,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material'
import InputLabel from '@mui/material/InputLabel'
import { meme } from '@renderer/components/shared/inputs/meme'
import { MaskInputProps, maskInputProps } from '@renderer/components/shared/inputs/types'
import { useServerZustand } from '@renderer/context/server.zustand'
import { checkHasConfig } from '@shared'
import { ElementType, forwardRef } from 'react'
import { IMaskInput, IMask } from 'react-imask'
import Select from '@mui/material/Select'
import { UnitIdString, UnitIdStringSchema } from '@shared'
import MenuItem from '@mui/material/MenuItem'
import React, { useState } from 'react'

const EndianToggle = meme(() => {
  const selectedUuid = useServerZustand((z) => z.selectedUuid)
  const littleEndian = useServerZustand((z) => z.littleEndian[selectedUuid] ?? false)
  const setLittleEndian = useServerZustand((z) => z.setLittleEndian)
  const ready = useServerZustand((z) => z.ready[selectedUuid])

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      color="primary"
      value={littleEndian}
      disabled={!ready}
      onChange={(_, v) => v !== null && setLittleEndian(v)}
    >
      <ToggleButton
        data-testid="server-endian-be-btn"
        aria-label="Big Endian"
        value={false}
        sx={{ whiteSpace: 'nowrap', px: 1.5 }}
        title="Big-Endian (Modbus standard)"
      >
        BE
      </ToggleButton>
      <ToggleButton
        data-testid="server-endian-le-btn"
        aria-label="Little Endian"
        value={true}
        sx={{ px: 1.5 }}
        title="Little-Endian (rare, check device docs)"
      >
        LE
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

interface UnitIdMenuItemProps {
  unitId: UnitIdString
}

const UnitIdMenuItem = meme(({ unitId }: UnitIdMenuItemProps) => {
  const hasConfig = useServerZustand((z) => {
    const reg = z.serverRegisters[z.selectedUuid]?.[unitId]
    return checkHasConfig(reg)
  })
  return (
    <Box
      sx={(theme) => ({
        background: hasConfig ? theme.palette.primary.dark : undefined,
        px: 1,
        mx: 0.5,
        fontWeight: hasConfig ? 'bold' : undefined,
        opacity: hasConfig ? 1 : 0.5,
        width: '100%',
        height: '100%',
        borderRadius: 2
      })}
    >
      {unitId}
    </Box>
  )
})

// Unit Id
const UnitId = meme(() => {
  const unitId = useServerZustand((z) => {
    const uuid = z.selectedUuid
    return z.getUnitId(uuid)
  })
  const labelId = 'unit-id-select'

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Unit ID</InputLabel>
      <Select
        data-testid="server-unitid-select"
        size="small"
        labelId={labelId}
        value={unitId}
        label="Unit ID"
        onChange={(e) => {
          const result = UnitIdStringSchema.safeParse(e.target.value)
          if (result.success) useServerZustand.getState().setUnitId(result.data)
        }}
        // sx={{ width: 80 }}
        slotProps={{ input: { sx: { pr: 0, pl: 1 } } }}
      >
        {UnitIdStringSchema.options.map((unitId) => (
          <MenuItem value={unitId} key={`unit_id_${unitId}`} sx={{ p: 0 }}>
            <UnitIdMenuItem unitId={unitId} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

const PortInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const portFromStore = useServerZustand((z) => z.port[z.selectedUuid])
  const [localPort, setLocalPort] = useState(portFromStore)

  // Sync localPort with store if store changes (e.g. after backend update)
  React.useEffect(() => {
    setLocalPort(portFromStore)
  }, [portFromStore])

  return (
    <IMaskInput
      {...other}
      autofix
      mask={IMask.MaskedNumber}
      min={0}
      max={65535}
      inputRef={ref}
      value={localPort}
      onAccept={(value: string) => {
        setLocalPort(value)
      }}
      onBlur={() => {
        // Only call set if the value is different from the store
        if (localPort !== portFromStore) {
          set(localPort, localPort.length > 0)
        }
      }}
    />
  )
})

PortInput.displayName = 'PortInput'

//
//
// Port
const Port = meme(() => {
  const port = useServerZustand((z) => z.port[z.selectedUuid])
  const portValid = useServerZustand((z) => z.portValid[z.selectedUuid])

  return (
    <TextField
      data-testid="server-port-input"
      error={!portValid}
      label={`Port ${port}`}
      variant="outlined"
      size="small"
      sx={{ width: 80 }}
      value={port}
      slotProps={{
        input: {
          inputComponent: PortInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({
            set: useServerZustand.getState().setPort
          })
        }
      }}
    />
  )
})

//
//
// Server Config
const ServerConfig = (): JSX.Element => {
  return (
    <Box sx={{ display: 'flex', gap: 2, ml: 'auto' }}>
      <EndianToggle />
      <UnitId />
      <Port />
    </Box>
  )
}

export default ServerConfig

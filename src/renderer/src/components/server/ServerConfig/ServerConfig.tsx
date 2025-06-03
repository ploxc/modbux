//
//

import FormControl from '@mui/material/FormControl'
import { TextField, Box, InputBaseComponentProps } from '@mui/material'
import InputLabel from '@mui/material/InputLabel'
import { meme } from '@renderer/components/shared/inputs/meme'
import { MaskInputProps, maskInputProps } from '@renderer/components/shared/inputs/types'
import { checkHasConfig, useServerZustand } from '@renderer/context/server.zustand'
import { ElementType, forwardRef } from 'react'
import { IMaskInput, IMask } from 'react-imask'
import Select from '@mui/material/Select'
import { UnitIdString, UnitIdStringSchema } from '@shared'
import MenuItem from '@mui/material/MenuItem'

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
  const unitId = useServerZustand((z) => z.unitId[z.selectedUuid])
  const labelId = 'unit-id-select'

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Unit ID</InputLabel>
      <Select
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

  return (
    <IMaskInput
      {...other}
      autofix
      mask={IMask.MaskedNumber}
      min={0}
      max={65535}
      inputRef={ref}
      // Port cannot exist yet
      validate={(v) => {
        const { port, selectedUuid } = useServerZustand.getState()
        const portAlreadyExists = Object.values(port).includes(v)
        const portIsMyPort = v === port[selectedUuid]

        return !portAlreadyExists || portIsMyPort
      }}
      onAccept={(value: string) => set(value, value.length > 0)}
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
      error={!portValid}
      label="Port"
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
      <UnitId />
      <Port />
      {/* <Restart /> */}
    </Box>
  )
}

export default ServerConfig

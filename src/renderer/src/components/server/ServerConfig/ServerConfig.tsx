//
//

import { TextField, Box } from '@mui/material'
import { MaskInputProps, maskInputProps } from '@renderer/components/shared/inputs/types'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import { useServerZustand } from '@renderer/context/server.zustand'
import { forwardRef } from 'react'
import { IMaskInput, IMask } from 'react-imask'

// Unit Id
const UnitId = () => {
  const unitId = useServerZustand((z) => z.unitId[z.selectedUuid])

  return (
    <TextField
      label="Unit ID"
      variant="outlined"
      size="small"
      sx={{ width: 80 }}
      value={unitId}
      slotProps={{
        input: {
          inputComponent: UnitIdInput as any,
          inputProps: maskInputProps({
            set: useServerZustand.getState().setUnitId
          })
        }
      }}
    />
  )
}

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

//
//
// Port
const Port = () => {
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
          inputComponent: PortInput as any,
          inputProps: maskInputProps({
            set: useServerZustand.getState().setPort
          })
        }
      }}
    />
  )
}

//
//
// Server Config
const ServerConfig = () => {
  return (
    <Box sx={{ display: 'flex', gap: 2, ml: 'auto' }}>
      <UnitId />
      <Port />
      {/* <Restart /> */}
    </Box>
  )
}

export default ServerConfig

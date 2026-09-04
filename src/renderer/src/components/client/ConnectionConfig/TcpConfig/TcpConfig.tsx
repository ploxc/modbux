import Box from '@mui/material/Box'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import HostInput from '@renderer/components/shared/inputs/HostInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { useClientZustand } from '@renderer/context/client.zustand'
import { ElementType } from 'react'

// Host
const Host = meme(() => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')
  const host = useClientZustand((z) => z.connectionConfig.tcp.host)
  const hostValid = useClientZustand((z) => z.valid.host)

  const setHost = useClientZustand.getState().setHost

  return (
    <TextField
      disabled={disabled}
      label="Host"
      variant="outlined"
      size="small"
      sx={{ width: 180 }}
      error={!hostValid}
      value={host}
      data-testid="tcp-host-input"
      slotProps={{
        input: {
          inputComponent: HostInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setHost })
        }
      }}
    />
  )
})

//
//
// Port
const Port = meme(() => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')
  const port = useClientZustand((z) => String(z.connectionConfig.tcp.options.port))

  const setPort = useClientZustand.getState().setPort

  return (
    <TextField
      disabled={disabled}
      label="Port"
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={port}
      data-testid="tcp-port-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setPort })
        }
      }}
    />
  )
})

const TcpConfig = meme((): JSX.Element => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'no-wrap' }}>
      <Host />
      <Box sx={{ display: 'flex', fontSize: 20, alignItems: 'center', pb: 0.5, px: 0.75 }}>:</Box>
      <Port />
    </Box>
  )
})
export default TcpConfig

import { TextField, Box, InputBaseComponentProps } from '@mui/material'
import HostInput from '@renderer/components/shared/inputs/HostInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ElementType } from 'react'

// Host
const Host = meme(() => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')
  const host = useRootZustand((z) => z.connectionConfig.tcp.host)
  const hostValid = useRootZustand((z) => z.valid.host)
  const setHost = useRootZustand((z) => z.setHost)

  return (
    <TextField
      disabled={disabled}
      label="IP Address"
      variant="outlined"
      size="small"
      sx={{ width: 130 }}
      error={!hostValid}
      value={host}
      data-testid="tcp-host-input"
      slotProps={{
        input: {
          inputComponent: HostInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setHost })
        }
      }}
      onBlur={async () => {
        // On blur, make sure the host is synced with the server
        const connectionConfig = await window.api.getConnectionConfig()
        setHost(connectionConfig.tcp.host, true)
      }}
    />
  )
})

//
//
// Port
const Port = meme(() => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')
  const port = useRootZustand((z) => String(z.connectionConfig.tcp.options.port))

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
          inputProps: maskInputProps({ set: useRootZustand.getState().setPort })
        }
      }}
    />
  )
})

const TcpConfig = (): JSX.Element => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'no-wrap' }}>
      <Host />
      <Box sx={{ display: 'flex', fontSize: 20, alignItems: 'center', pb: 0.5, px: 0.75 }}>:</Box>
      <Port />
    </Box>
  )
}
export default TcpConfig

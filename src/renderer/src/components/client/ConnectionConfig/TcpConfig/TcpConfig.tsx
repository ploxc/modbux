import { TextField, Box } from '@mui/material'
import HostInput from '@renderer/components/shared/inputs/HostInput'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { useRootZustand } from '@renderer/context/root.zustand'

// Host
const Host = () => {
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
      slotProps={{
        input: {
          inputComponent: HostInput as any,
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
}

//
//
// Port
const Port = () => {
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
      slotProps={{
        input: {
          inputComponent: UIntInput as any,
          inputProps: maskInputProps({ set: useRootZustand.getState().setPort })
        }
      }}
    />
  )
}

const TcpConfig = () => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'no-wrap' }}>
      <Host />
      <Box sx={{ display: 'flex', fontSize: 20, alignItems: 'center', pb: 0.5, px: 0.75 }}>:</Box>
      <Port />
    </Box>
  )
}
export default TcpConfig

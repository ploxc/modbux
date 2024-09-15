import { TextField, Box } from '@mui/material'
import HostInput from '@renderer/components/HostInput'
import { maskInputProps } from '@renderer/components/types'
import UIntInput from '@renderer/components/UintInput'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ConnectState } from '@shared'

// Host
const Host = () => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== ConnectState.Disconnected)
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
  const disabled = useRootZustand((z) => z.clientState.connectState !== ConnectState.Disconnected)
  const port = useRootZustand((z) => String(z.connectionConfig.tcp.options.port))
  const setPort = useRootZustand((z) => z.setPort)

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
          inputProps: maskInputProps({ set: setPort })
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

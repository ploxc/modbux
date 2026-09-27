import Box from '@mui/material/Box'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import HostInput from '@renderer/components/shared/inputs/HostInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { useClientZustand, selectedClient, selectedSession } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { ElementType } from 'react'

// Host
const Host = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )
  const host = useClientZustand((z) => selectedClient(z).connectionConfig.tcp.host)
  const hostValid = useClientZustand((z) => selectedSession(z).valid.host)

  const setHost = useClientZustand.getState().setHost

  return (
    <TextField
      disabled={disabled}
      label="Host"
      variant="outlined"
      size="large"
      sx={{ flex: '1 1 0', minWidth: 130 }}
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
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )
  const port = useClientZustand((z) => String(selectedClient(z).connectionConfig.tcp.options.port))

  const setPort = useClientZustand.getState().setPort

  return (
    <TextField
      disabled={disabled}
      label="Port"
      variant="outlined"
      size="large"
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
    // The host takes the bar's room before the workspace's name does: `&&` over
    // the bar's own rule that its children do not shrink, and twice the name's
    // share of what is left, up to what an address needs.
    <Box sx={{ display: 'flex', flexWrap: 'no-wrap', '&&': { flex: '2 1 0' }, maxWidth: 300 }}>
      <Host />
      <Box sx={{ display: 'flex', fontSize: 20, alignItems: 'center', pb: 0.5, px: 0.75 }}>:</Box>
      <Port />
    </Box>
  )
})
export default TcpConfig

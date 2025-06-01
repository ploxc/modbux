import { Box, Button, ButtonProps, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import RtuConfig from './RtuConfig/RtuConfig'
import TcpConfig from './TcpConfig/TcpConfig'
import { useRootZustand } from '@renderer/context/root.zustand'
import { Protocol } from '@shared'
import { useCallback } from 'react'
import { maskInputProps } from '@renderer/components/types'
import UnitIdInput from '@renderer/components/UnitIdInput'
import { useDataZustand } from '@renderer/context/data.zustand'

// Protocol
const ProtocolSelect = ({ protocol }: { protocol: Protocol }) => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')
  const setProtocol = useRootZustand((z) => z.setProtocol)

  return (
    <ToggleButtonGroup
      disabled={disabled}
      size="small"
      exclusive
      color="primary"
      value={protocol}
      onChange={(_, v) => v !== null && setProtocol(v)}
    >
      <ToggleButton value={'ModbusTcp'}>TCP</ToggleButton>
      <ToggleButton value={'ModbusRtu'}>RTU</ToggleButton>
    </ToggleButtonGroup>
  )
}

const ConnectButton = () => {
  const connectState = useRootZustand((z) => z.clientState.connectState)
  const setRegisterData = useDataZustand((z) => z.setRegisterData)

  const action = useCallback(() => {
    const currentConnectedState = useRootZustand.getState().clientState.connectState
    if (currentConnectedState === 'connected') {
      window.api.disconnect()
      setRegisterData([])
      return
    }

    if (currentConnectedState === 'disconnected') {
      window.api.connect()
    }
  }, [])

  const disabled = ['connecting', 'disconnecting'].includes(connectState)
  const color: ButtonProps['color'] = connectState === 'connected' ? 'warning' : 'primary'
  const text =
    connectState === 'connected'
      ? 'Disconnect'
      : connectState === 'disconnected'
        ? 'Connect'
        : '...'

  return (
    <Button sx={{ width: 100 }} disabled={disabled} onClick={action} color={color}>
      {text}
    </Button>
  )
}

//
//
// Unit Id
const UnitId = () => {
  const unitId = useRootZustand((z) => String(z.connectionConfig.unitId))

  return (
    <TextField
      label="Unit ID"
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={unitId}
      slotProps={{
        input: {
          inputComponent: UnitIdInput as any,
          inputProps: maskInputProps({ set: useRootZustand.getState().setUnitId })
        }
      }}
    />
  )
}

const ConnectionConfig = () => {
  const protocol = useRootZustand((z) => z.connectionConfig.protocol)
  return (
    <>
      {protocol === 'ModbusTcp' ? <TcpConfig /> : <RtuConfig />}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <ProtocolSelect protocol={protocol} />
        <UnitId />
        <ConnectButton />
      </Box>
    </>
  )
}
export default ConnectionConfig

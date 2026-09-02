import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { ButtonProps } from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import RtuConfig from './RtuConfig/RtuConfig'
import SerialGroupModal from '@renderer/components/client/SerialGroupModal/SerialGroupModal'
import { useSerialGroupZustand } from '@renderer/components/client/SerialGroupModal/serialGroupModal.zustand'
import TcpConfig from './TcpConfig/TcpConfig'
import { useClientZustand } from '@renderer/context/client.zustand'
import { Protocol } from '@shared'
import { ElementType, useCallback } from 'react'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import { useDataZustand } from '@renderer/context/data.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'

// Protocol
const ProtocolSelect = meme(({ protocol }: { protocol: Protocol }) => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')
  const setProtocol = useClientZustand((z) => z.setProtocol)

  // RTU over TCP is a TCP-family transport (toggled from the options menu),
  // so the TCP button stays highlighted for it -- but in warning colour, since
  // it reuses the same host and port and would otherwise be indistinguishable
  // from plain TCP.
  //
  // Switching to serial RTU and back lands on plain TCP by design: the mode
  // lives in the single `protocol` value, and silently restoring the
  // encapsulated variant would make "TCP doesn't work" hard to diagnose.
  // Anyone who wants it ticks the box again.
  const rtuOverTcp = protocol === 'ModbusRtuOverTcp'
  const toggleValue: Protocol = protocol === 'ModbusRtu' ? 'ModbusRtu' : 'ModbusTcp'

  const tcpButton = (
    <ToggleButton
      value={'ModbusTcp'}
      data-testid="protocol-tcp-btn"
      color={rtuOverTcp ? 'warning' : 'primary'}
    >
      TCP
    </ToggleButton>
  )

  return (
    <ToggleButtonGroup
      disabled={disabled}
      size="small"
      exclusive
      color="primary"
      value={toggleValue}
      onChange={(_, v) => v !== null && setProtocol(v)}
    >
      {rtuOverTcp ? (
        <Tooltip title="RTU over TCP is on: raw RTU frames over the socket, not Modbus TCP. Turn it off in the cog menu.">
          {tcpButton}
        </Tooltip>
      ) : (
        tcpButton
      )}
      <ToggleButton value={'ModbusRtu'} data-testid="protocol-rtu-btn">
        RTU
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

const ConnectButton = meme(() => {
  const connectState = useClientZustand((z) => z.clientState.connectState)
  const setRegisterData = useDataZustand((z) => z.setRegisterData)

  const action = useCallback(async (): Promise<void> => {
    const currentConnectedState = useClientZustand.getState().clientState.connectState
    if (['connecting', 'connected'].includes(currentConnectedState)) {
      window.api.disconnect()
      if (!useClientZustand.getState().readConfiguration) {
        setRegisterData([])
      }
      return
    }

    if (currentConnectedState === 'disconnected') {
      // On RTU the port can be there and still refuse to open. Ask first and
      // say why, rather than let the connect fail on a permission error.
      if (useClientZustand.getState().connectionConfig.protocol === 'ModbusRtu') {
        const blocked = await useSerialGroupZustand.getState().check(true)
        if (blocked) return
      }
      window.api.connect()
    }
  }, [setRegisterData])

  const disabled = ['disconnecting'].includes(connectState)

  const color: ButtonProps['color'] = ['connecting', 'connected'].includes(connectState)
    ? 'warning'
    : 'primary'

  const text =
    connectState === 'connected' ? (
      'Disconnect'
    ) : connectState === 'disconnected' ? (
      'Connect'
    ) : (
      <CircularProgress
        size={18}
        title="Cancel"
        sx={(theme) => ({
          color: theme.palette.warning.contrastText
        })}
      />
    )

  return (
    <Button
      sx={{ width: 100 }}
      disabled={disabled}
      onClick={action}
      color={color}
      data-testid="connect-btn"
    >
      {text}
    </Button>
  )
})

//
//
// Unit Id
const UnitId = meme(() => {
  const unitId = useClientZustand((z) => String(z.connectionConfig.unitId))

  return (
    <TextField
      label="Unit ID"
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={unitId}
      data-testid="client-unitid-input"
      slotProps={{
        input: {
          inputComponent: UnitIdInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: useClientZustand.getState().setUnitId })
        }
      }}
    />
  )
})

const ConnectionConfig = meme(() => {
  const protocol = useClientZustand((z) => z.connectionConfig.protocol)
  return (
    <>
      {/* RTU over TCP reuses the TCP host/port inputs; only serial RTU uses the COM form. */}
      {protocol === 'ModbusRtu' ? <RtuConfig /> : <TcpConfig />}
      {/* Serial RTU is the only mode that needs a group membership to work. */}
      <SerialGroupModal active={protocol === 'ModbusRtu'} />
      <Box sx={{ display: 'flex', gap: 2 }}>
        <ProtocolSelect protocol={protocol} />
        <UnitId />
        <ConnectButton />
      </Box>
    </>
  )
})

export default ConnectionConfig

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { ButtonProps } from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import RtuConfig from './RtuConfig'
import SerialGroupModal from '@renderer/components/client/SerialGroupModal/SerialGroupModal'
import { useSerialGroupZustand } from '@renderer/components/client/SerialGroupModal/serialGroupModal.zustand'
import TcpConfig from './TcpConfig'
import {
  useClientZustand,
  getSelectedClient,
  getSelectedSession,
  selectedClient,
  selectedClientUuid,
  selectedSession
} from '@renderer/context/client.zustand'
import { Protocol, unitIdOutOfRange } from '@shared'
import { ElementType, useCallback } from 'react'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import { useDataZustand, dataOf, getShownData } from '@renderer/context/data.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'

// Protocol
const ProtocolSelect = meme(({ protocol }: { protocol: Protocol }) => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useDataZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )

  const handleChange = useCallback((_event: unknown, value: Protocol | null): void => {
    if (value === null) return
    const clientZustand = useClientZustand.getState()
    clientZustand.setProtocol(value)
  }, [])

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
      onChange={handleChange}
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
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const connectState = useDataZustand((z) => dataOf(z, selectedUuid).clientState.connectState)

  /**
   * Whether the field this protocol connects through names somewhere.
   *
   * Not a schema's answer: `ConnectionConfigSchema` types both `host` and
   * `com` as a bare string and takes a blank one, which is why `setHost` and
   * `setCom` carry a flag of their own and keep what the field decides without
   * sending it. So the field shows what was typed and main holds the value
   * before it, and pressing Connect on a half typed host connected to the
   * previous one while the app reported connected over a field saying
   * otherwise. The field is already drawn in error, and this is the press that
   * goes with it.
   *
   * The flag is not persisted, so `init` reads it back off the value. Main is
   * handed that value either way, and a press here is what the blank has left
   * to reach.
   */
  const addressValid = useClientZustand((z) =>
    selectedClient(z).connectionConfig.protocol === 'ModbusRtu'
      ? selectedSession(z).valid.com
      : selectedSession(z).valid.host
  )
  // Main refuses the connect as well; this keeps the serial check from running first.
  const unitIdOutOfRangeNow = useClientZustand(
    (z) => unitIdOutOfRange(selectedClient(z).connectionConfig) !== undefined
  )

  const action = useCallback(async (): Promise<void> => {
    const currentConnectedState = getShownData().clientState.connectState
    if (['connecting', 'connected'].includes(currentConnectedState)) {
      window.api.disconnect(selectedClientUuid())
      if (!getSelectedSession().readConfiguration) {
        useDataZustand.getState().setRegisterData(selectedClientUuid(), [])
      }
      return
    }

    if (currentConnectedState === 'disconnected') {
      // On RTU the port can be there and still refuse to open. Ask first and
      // say why, rather than let the connect fail on a permission error.
      if (getSelectedClient().connectionConfig.protocol === 'ModbusRtu') {
        const blocked = await useSerialGroupZustand.getState().check({ force: true })
        if (blocked) return
      }
      window.api.connect(selectedClientUuid())
    }
  }, [])

  // Only the press that connects. Disconnect and the cancel a connecting state
  // draws go through this same button, and neither is refused for a field.
  const disabled =
    connectState === 'disconnecting' ||
    (connectState === 'disconnected' && (!addressValid || unitIdOutOfRangeNow))

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
  const unitId = useClientZustand((z) => String(selectedClient(z).connectionConfig.unitId))
  // A string or undefined, which compares equal from one read to the next.
  const outOfRange = useClientZustand((z) => unitIdOutOfRange(selectedClient(z).connectionConfig))

  const setUnitId = useClientZustand.getState().setUnitId

  return (
    <Tooltip title={outOfRange ?? ''}>
      <TextField
        label="Unit ID"
        variant="outlined"
        size="small"
        sx={{ width: 60 }}
        error={outOfRange !== undefined}
        value={unitId}
        data-testid="client-unitid-input"
        slotProps={{
          input: {
            inputComponent: UnitIdInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
            inputProps: maskInputProps({ set: setUnitId })
          }
        }}
      />
    </Tooltip>
  )
})

const ConnectionConfig = meme(() => {
  const protocol = useClientZustand((z) => selectedClient(z).connectionConfig.protocol)
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

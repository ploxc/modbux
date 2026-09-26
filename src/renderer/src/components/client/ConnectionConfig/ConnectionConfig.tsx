import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { ButtonProps } from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import Tooltip from '@mui/material/Tooltip'
import RtuConfig from './RtuConfig'
import SerialGroupModal from '@renderer/components/client/SerialGroupModal/SerialGroupModal'
import { useSerialGroupZustand } from '@renderer/components/client/SerialGroupModal/serialGroupModal.zustand'
import TcpConfig from './TcpConfig'
import {
  getSelectedClient,
  selectedClient,
  selectedClientUuid,
  selectedSession,
  selectedUnit,
  useClientZustand,
  readsConfiguration
} from '@renderer/context/client.zustand'
import { Protocol, PROTOCOL_LABELS, unitIdOutOfRange } from '@shared'
import { ElementType, useCallback } from 'react'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import {
  useLiveZustand,
  dataOf,
  getShownData,
  setShownRegisterData
} from '@renderer/context/live.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import ProtocolIcon from '@renderer/components/client/ClientSidebar/ProtocolIcon'
import PollButton from './PollButton'
import { PollRateSelect, TimeoutSelect } from './ReadTiming'

// Protocol
const PROTOCOLS: Protocol[] = ['ModbusTcp', 'ModbusRtuOverTcp', 'ModbusRtu']

const ProtocolOption = meme(({ protocol }: { protocol: Protocol }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
    <ProtocolIcon protocol={protocol} />
    {PROTOCOL_LABELS[protocol]}
  </Box>
))

const renderProtocol = (protocol: Protocol): JSX.Element => <ProtocolOption protocol={protocol} />

const ProtocolSelect = meme(() => {
  const labelId = 'protocol-select'
  const protocol = useClientZustand((z) => selectedClient(z).connectionConfig.protocol)
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )

  const handleChange = useCallback((event: SelectChangeEvent<Protocol>): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setProtocol(event.target.value as Protocol)
  }, [])

  return (
    <FormControl size="large" sx={{ width: 180 }}>
      <InputLabel id={labelId}>Protocol</InputLabel>
      <Select
        disabled={disabled}
        size="large"
        labelId={labelId}
        label="Protocol"
        value={protocol}
        renderValue={renderProtocol}
        onChange={handleChange}
        data-testid="protocol-select"
      >
        {PROTOCOLS.map((option) => (
          <MenuItem key={option} value={option} data-testid={`protocol-option-${option}`}>
            <ProtocolOption protocol={option} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

const ConnectButton = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const connectState = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.connectState)

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

  const action = useCallback(async (): Promise<void> => {
    const currentConnectedState = getShownData().clientState.connectState
    if (['connecting', 'connected'].includes(currentConnectedState)) {
      window.api.disconnect(selectedClientUuid())
      if (!readsConfiguration(useClientZustand.getState())) setShownRegisterData([])
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
    connectState === 'disconnecting' || (connectState === 'disconnected' && !addressValid)

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
      size="large"
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
  const unitId = useClientZustand((z) => String(selectedUnit(z).unitId))
  // A string or undefined, which compares equal from one read to the next.
  const outOfRange = useClientZustand((z) =>
    unitIdOutOfRange({
      protocol: selectedClient(z).connectionConfig.protocol,
      unitId: selectedUnit(z).unitId
    })
  )

  const setUnitId = useClientZustand.getState().setUnitId

  return (
    <Tooltip title={outOfRange ?? ''}>
      <TextField
        label="Unit ID"
        variant="outlined"
        size="large"
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
      <ProtocolSelect />
      {/* RTU over TCP reuses the TCP host/port inputs; only serial RTU uses the COM form. */}
      {protocol === 'ModbusRtu' ? <RtuConfig /> : <TcpConfig />}
      {/* Serial RTU is the only mode that needs a group membership to work. */}
      <SerialGroupModal active={protocol === 'ModbusRtu'} />
      <UnitId />
      <Divider orientation="vertical" flexItem sx={{ my: 0.75 }} />
      <PollRateSelect />
      <TimeoutSelect />
      <PollButton />
      <ConnectButton />
    </>
  )
})

export default ConnectionConfig

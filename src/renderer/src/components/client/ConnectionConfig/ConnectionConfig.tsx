import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { ButtonProps } from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import RtuConfig from './RtuConfig'
import SerialGroupModal from '@renderer/components/client/SerialGroupModal/SerialGroupModal'
import TcpConfig from './TcpConfig'
import { toggleConnection } from './toggleConnection'
import StopPollDialog, {
  asksBeforeDisconnecting
} from '@renderer/components/client/Logging/StopPollDialog'
import { selectedClient, selectedSession, useClientZustand } from '@renderer/context/client.zustand'
import { Protocol, PROTOCOL_LABELS } from '@shared'
import { useCallback, useState } from 'react'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import ProtocolIcon from '@renderer/components/client/ClientSidebar/ProtocolIcon'
import { PROTOCOL_COLORS } from '@renderer/components/client/ClientSidebar/clientStatus'
import Check from '@mui/icons-material/Check'
import PowerSettingsNew from '@mui/icons-material/PowerSettingsNew'
import { alpha } from '@mui/material/styles'
import PollButton from './PollButton'
import LogButton from '@renderer/components/client/Logging/LogButton'
import { ReadTiming } from './ReadTiming'

// Protocol
const PROTOCOLS: Protocol[] = ['ModbusTcp', 'ModbusRtuOverTcp', 'ModbusRtu']

/** The class of the protocol's name in the field, which the top bar hides when it narrows. */
export const PROTOCOL_NAME = 'protocol-name'
/** The class of the field, which the top bar narrows to its badge. */
export const PROTOCOL_FIELD = 'protocol-field'

/** The class of Connect's word, which the top bar trades for its icon when it narrows. */
export const CONNECT_LABEL = 'connect-label'
/** The class of Connect's icon, shown in place of its word. */
export const CONNECT_ICON = 'connect-icon'
/** The class of the Connect button, which the top bar narrows to its icon. */
export const CONNECT_BUTTON = 'connect-button'

const ProtocolOption = meme(({ protocol }: { protocol: Protocol }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
    <ProtocolIcon protocol={protocol} size={16} />
    <span className={PROTOCOL_NAME}>{PROTOCOL_LABELS[protocol]}</span>
  </Box>
))

const renderProtocol = (protocol: Protocol): JSX.Element => <ProtocolOption protocol={protocol} />

/** What each transport carries, under its name in the menu. */
const PROTOCOL_DESCRIPTIONS: Record<Protocol, string> = {
  ModbusTcp: 'MBAP header over Ethernet',
  ModbusRtuOverTcp: 'RTU frames with CRC through a TCP gateway',
  ModbusRtu: 'Serial line, RS-485 or RS-232'
}

/** A protocol in the open menu: its badge, its name and what it carries, and a check when chosen. */
const ProtocolMenuOption = meme(
  ({ protocol, chosen }: { protocol: Protocol; chosen: boolean }): JSX.Element => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
      <Box
        sx={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: alpha(PROTOCOL_COLORS[protocol], 0.16)
        }}
      >
        <ProtocolIcon protocol={protocol} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexGrow: 1, minWidth: 0 }}>
        <Box component="span" sx={{ fontSize: 13, fontWeight: 500 }}>
          {PROTOCOL_LABELS[protocol]}
        </Box>
        <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
          {PROTOCOL_DESCRIPTIONS[protocol]}
        </Box>
      </Box>
      {chosen && <Check sx={{ fontSize: 16, color: 'primary.light' }} />}
    </Box>
  )
)

/** The menu is wider than the field, for the descriptions. */
const PROTOCOL_MENU_PROPS = {
  slotProps: { paper: { sx: { width: 360 } } },
  anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
  transformOrigin: { vertical: 'top', horizontal: 'left' }
} as const

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
    <FormControl size="large" className={PROTOCOL_FIELD} sx={{ width: 160 }}>
      <InputLabel id={labelId}>Protocol</InputLabel>
      <Select
        disabled={disabled}
        size="large"
        labelId={labelId}
        label="Protocol"
        value={protocol}
        renderValue={renderProtocol}
        onChange={handleChange}
        MenuProps={PROTOCOL_MENU_PROPS}
        data-testid="protocol-select"
      >
        {PROTOCOLS.map((option) => (
          <MenuItem
            key={option}
            value={option}
            data-testid={`protocol-option-${option}`}
            // Two lines and a badge rather than one line of text.
            sx={{ height: 'auto', py: 1, pr: 1.5 }}
          >
            <ProtocolMenuOption protocol={option} chosen={option === protocol} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

const ConnectButton = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const connectState = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.connectState)
  // Disconnecting a client that logs stops the log, which is asked about first.
  const logging = useLiveZustand(
    (z) =>
      dataOf(z, selectedUuid).clientState.log.enabled && dataOf(z, selectedUuid).clientState.polling
  )
  const [asking, setAsking] = useState(false)
  const handleClick = useCallback(() => {
    if (logging && connectState !== 'disconnected' && asksBeforeDisconnecting()) {
      setAsking(true)
      return
    }
    void toggleConnection()
  }, [logging, connectState])
  const handleCloseAsking = useCallback(() => setAsking(false), [])
  const disconnect = useCallback(() => {
    void toggleConnection()
  }, [])

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

  // Only the press that connects. Disconnect and the cancel a connecting state
  // draws go through this same button, and neither is refused for a field.
  const disabled =
    connectState === 'disconnecting' || (connectState === 'disconnected' && !addressValid)

  const color: ButtonProps['color'] = ['connecting', 'connected'].includes(connectState)
    ? 'warning'
    : 'primary'

  const label =
    connectState === 'connected'
      ? 'Disconnect'
      : connectState === 'disconnected'
        ? 'Connect'
        : undefined

  const text =
    label !== undefined ? (
      <>
        <span className={CONNECT_LABEL}>{label}</span>
        <PowerSettingsNew className={CONNECT_ICON} fontSize="small" />
      </>
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
    <>
      <Button
        size="large"
        className={CONNECT_BUTTON}
        sx={{ width: 100 }}
        disabled={disabled}
        onClick={handleClick}
        color={color}
        aria-label={label ?? 'Cancel'}
        title={label ?? 'Cancel'}
        data-testid="connect-btn"
      >
        {text}
      </Button>
      {asking && (
        <StopPollDialog stopping="disconnect" onStop={disconnect} onClose={handleCloseAsking} />
      )}
    </>
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
      <Divider orientation="vertical" flexItem sx={{ my: 0.75 }} />
      <ReadTiming />
      <LogButton />
      <PollButton />
      <ConnectButton />
    </>
  )
})

export default ConnectionConfig

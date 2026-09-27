import { ClientState, ConnectionConfig, Protocol, serialLine } from '@shared'

/** How a status reads at a glance: green, amber, red or grey. */
export type StatusTone = 'ok' | 'busy' | 'error' | 'idle'

export interface ClientStatus {
  label: string
  tone: StatusTone
  /** Connected and polling, which the dot shows as a pulsing ring in the poll colour. */
  polling: boolean
  /** A ring rather than a dot: not connected, or polling with nothing on screen to read. */
  hollow: boolean
}

/**
 * What a client card says about its connection. `offline` is whether any of
 * its units main has stopped hearing from: such a unit is polled less often
 * but the client stays connected, so it reads as a timeout rather than as
 * polling.
 */
export const clientStatus = ({
  connectState,
  polling,
  pollIdle,
  offline
}: Pick<ClientState, 'connectState' | 'polling' | 'pollIdle'> & {
  offline: boolean
}): ClientStatus => {
  const still = { polling: false, hollow: false }
  if (connectState === 'connecting') return { label: 'Connecting', tone: 'busy', ...still }
  if (connectState === 'disconnecting') return { label: 'Disconnecting', tone: 'busy', ...still }
  if (connectState === 'disconnected')
    return { label: 'Disconnected', tone: 'idle', polling: false, hollow: true }
  if (offline)
    return { label: 'Timeout', tone: 'error', polling: polling && !pollIdle, hollow: false }
  if (polling && pollIdle)
    return { label: 'Polling, paused: not on screen', tone: 'ok', polling: false, hollow: true }
  if (polling) return { label: 'Polling', tone: 'ok', polling: true, hollow: false }
  return { label: 'Connected', tone: 'ok', ...still }
}

/** Where a client connects: host and port, or the COM port and its line. */
export const clientAddress = ({ protocol, tcp, rtu }: ConnectionConfig): string =>
  protocol === 'ModbusRtu'
    ? `${rtu.com || 'No COM port'} · ${serialLine(rtu.options)}`
    : `${tcp.host}:${tcp.options.port}`

/** The colour a protocol is drawn in, on the card and in the rail. */
export const PROTOCOL_COLORS: Record<Protocol, string> = {
  ModbusTcp: '#7fb59b',
  ModbusRtuOverTcp: '#8fb0dd',
  ModbusRtu: '#e0b36a'
}

export const STATUS_COLORS: Record<StatusTone, string> = {
  ok: '#81bc57',
  busy: '#f9a620',
  error: '#e5534b',
  idle: '#6b6b6b'
}

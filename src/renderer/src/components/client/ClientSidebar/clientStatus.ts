import { ClientState, ConnectionConfig, Protocol, serialLine } from '@shared'

/** How a status reads at a glance: green, amber, red or grey. */
export type StatusTone = 'ok' | 'busy' | 'error' | 'idle'

export interface ClientStatus {
  label: string
  tone: StatusTone
  /** Connected and polling, which the dot shows as a pulsing ring in the poll colour. */
  polling: boolean
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
  offline
}: Pick<ClientState, 'connectState' | 'polling'> & { offline: boolean }): ClientStatus => {
  if (connectState === 'connecting') return { label: 'Connecting', tone: 'busy', polling: false }
  if (connectState === 'disconnecting')
    return { label: 'Disconnecting', tone: 'busy', polling: false }
  if (connectState === 'disconnected')
    return { label: 'Disconnected', tone: 'idle', polling: false }
  if (offline) return { label: 'Timeout', tone: 'error', polling }
  if (polling) return { label: 'Polling', tone: 'ok', polling: true }
  return { label: 'Connected', tone: 'ok', polling: false }
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

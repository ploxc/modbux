import type {
  AddressGroupsEvent,
  McpCall,
  McpResult,
  McpSettings,
  McpStatus,
  McpToken,
  ClientConnectionConfigUpdate,
  ClientCreate,
  ClientReadConfiguration,
  ClientRegisterConfigUpdate,
  ClientRegisterMapping,
  ClientScanRegisters,
  ClientScanUnitIds,
  ClientStateEvent,
  ClientWrite,
  RegisterDataEvent,
  RemoveRegisterParams,
  ScanProgressEvent,
  ScanUnitIdResultEvent,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  ServerEndianness,
  ResetRegistersParams,
  ResetBoolsParams,
  CreateServerParams,
  ClientState,
  AddRegisterParams,
  TransactionEvent,
  RegisterValue,
  SerialPortInfo,
  SerialPortValidationResult,
  StartRtuServerParams,
  PrivilegedPortStatus,
  PrivilegedPortFixMode,
  PrivilegedPortFixResult,
  SerialGroupStatus,
  SerialGroupFixResult
} from '@shared'
// `import type`, because shared is the one module all three processes compile
// against and notistack is a renderer dependency. `variant` below is the only
// thing taken from it, in a type position. esbuild dropped the import either
// way: `grep -c notistack out/main/index.js out/preload/index.js` answers 0 for
// both, before and after this line changed.
import type { SharedProps } from 'notistack'

/**
 * Which windows are open, as `window_update` carries it.
 *
 * The handles live in main's `Windows`; this is the renderer's half of that,
 * which is why it sits with the event that carries it.
 */
interface WindowsOpen {
  main: boolean
  server: boolean
}

/**
 * IPC Channel Definitions
 *
 * Channel names are defined in snake_case (e.g., 'update_register_config').
 * These are automatically converted to camelCase methods on window.api
 * in the preload script (e.g., window.api.updateRegisterConfig()).
 *
 * To add a new IPC channel:
 * 1. Add the channel name to IPC_CHANNELS
 * 2. Define its args and return type in IpcHandlerSpec
 * 3. The camelCase method will be automatically available on window.api
 */
export const IPC_CHANNELS = [
  'create_client',
  'delete_client',
  'update_connection_config',
  'update_register_config',
  'get_client_states',
  'set_register_mapping',
  'connect',
  'disconnect',
  'read',
  'start_polling',
  'stop_polling',
  'write',
  'scan_unit_ids',
  'stop_scanning_unit_ids',
  'scan_registers',
  'stop_scanning_registers',
  'add_replace_server_register',
  'remove_server_register',
  'sync_server_register',
  'set_server_endianness',
  'reset_registers',
  'set_bool',
  'reset_bools',
  'sync_bools',
  'set_server_port',
  'get_app_version',
  'create_server',
  'delete_server',
  'reset_server',
  'list_serial_ports',
  'validate_serial_port',
  'set_read_configuration',
  'start_rtu_server',
  'stop_rtu_server',
  'get_rtu_server_status',
  'get_server_ports',
  'stop_all_tcp_servers',
  'get_privileged_port_status',
  'apply_privileged_port_fix',
  'get_serial_group_status',
  'apply_serial_group_fix',
  'request_logout',
  'set_mcp_settings',
  'create_mcp_token'
] as const

type IpcChannel = (typeof IPC_CHANNELS)[number]

/**
 * IpcHandlerMap associates each IpcChannel with:
 * - args: the argument types that the renderer needs to pass
 * - return: the value the handler answers, never the promise around it.
 *   Every call crosses the boundary, so every one of them is async, and
 *   `IpcListener` takes `Promise<R> | R` while the preload wraps the lot.
 *
 * ! NOTE: The keys below MUST exactly match IpcChannel.
 * ! If you add a channel to IPC_CHANNELS, add it here.
 * ! If you remove one, remove it here. No extras allowed.
 */
interface IpcHandlerSpec {
  /**
   * Make the client main addresses under a uuid, on the config a window holds
   * for it.
   *
   * A window that loads again finds its client in main as it left it,
   * connected and polling included. The config goes to that client too, except
   * the connection it rides on while it rides one.
   */
  ['create_client']: {
    args: [ClientCreate]
    return: void
  }

  /** Take a client away, disconnecting it first if it is connected. */
  ['delete_client']: {
    args: [string]
    return: void
  }

  /**
   * Update a client's ConnectionConfig (DeepPartial), and say whether it was
   * taken.
   *
   * `true` is the whole answer, because main merges exactly the payload it was
   * given. A refusal answers `undefined`, which is what `createIpcHandle` sends
   * back, and the store keeps what it had.
   */
  ['update_connection_config']: {
    args: [ClientConnectionConfigUpdate]
    return: true | undefined
  }

  /** Update a client's RegisterConfig (DeepPartial), and say whether it was taken. */
  ['update_register_config']: {
    args: [ClientRegisterConfigUpdate]
    return: true | undefined
  }

  /**
   * What every client is doing right now, by uuid.
   *
   * `client_state` is pushed on a change, so a window that opens after the last
   * push has nothing to catch up on and starts on the initial literal. This is
   * how it asks.
   */
  ['get_client_states']: {
    args: []
    return: Record<string, ClientState>
  }

  /** Set a client's RegisterMapping, and say whether it was taken. */
  ['set_register_mapping']: {
    args: [ClientRegisterMapping]
    return: true | undefined
  }

  /** Connect a client */
  ['connect']: {
    args: [string]
    return: void
  }

  /** Disconnect a client */
  ['disconnect']: {
    args: [string]
    return: void
  }

  /** Read a client's registers. The rows come back as a `register_data` event. */
  ['read']: {
    args: [string]
    return: void
  }

  /** Start polling on a client */
  ['start_polling']: {
    args: [string]
    return: void
  }

  /** Stop polling on a client */
  ['stop_polling']: {
    args: [string]
    return: void
  }

  /** Write to registers through a client */
  ['write']: {
    args: [ClientWrite]
    return: void
  }

  /** Start scanning for unit IDs on a client */
  ['scan_unit_ids']: {
    args: [ClientScanUnitIds]
    return: void
  }

  /** Stop a client's unit ID scan */
  ['stop_scanning_unit_ids']: {
    args: [string]
    return: void
  }

  /** Start scanning registers on a client */
  ['scan_registers']: {
    args: [ClientScanRegisters]
    return: void
  }

  /** Stop a client's register scan */
  ['stop_scanning_registers']: {
    args: [string]
    return: void
  }

  /**
   * Add or replace a server register, and answer the words now held from its
   * address on. Undefined means the payload was refused and nothing changed.
   */
  ['add_replace_server_register']: {
    args: [AddRegisterParams]
    return: number[] | undefined
  }

  /** Remove a register value on the server */
  ['remove_server_register']: {
    args: [RemoveRegisterParams]
    return: void
  }

  /** Synchronize server registers */
  ['sync_server_register']: {
    args: [SyncRegisterValueParams]
    return: void
  }

  /** Set the byte order a server encodes its registers in */
  ['set_server_endianness']: {
    args: [ServerEndianness]
    return: void
  }

  /** Reset all server registers */
  ['reset_registers']: {
    args: [ResetRegistersParams]
    return: void
  }

  /** Set a boolean on the server */
  ['set_bool']: {
    args: [SetBooleanParameters]
    return: void
  }

  /** Reset all booleans on the server */
  ['reset_bools']: {
    args: [ResetBoolsParams]
    return: void
  }

  /** Synchronize all booleans on the server */
  ['sync_bools']: {
    args: [SyncBoolsParameters]
    return: void
  }

  /** Set the server port */
  ['set_server_port']: {
    args: [CreateServerParams]
    return: number | undefined
  }

  /** Create a new server */
  ['create_server']: {
    args: [CreateServerParams]
    return: number | undefined
  }

  /** Delete an existing server (UUID) */
  ['delete_server']: {
    args: [string]
    return: void
  }

  /** Retrieve the application version */
  ['get_app_version']: {
    args: []
    return: string
  }

  /** Reset an existing server (UUID) */
  ['reset_server']: {
    args: [string]
    return: void
  }

  /** List available serial ports */
  ['list_serial_ports']: {
    args: []
    return: SerialPortInfo[]
  }

  /** Validate whether a serial port path exists */
  ['validate_serial_port']: {
    args: [string]
    return: SerialPortValidationResult
  }

  /**
   * Set a client's readConfiguration flag (session-only, not persisted), and
   * say whether it was taken.
   */
  ['set_read_configuration']: {
    args: [ClientReadConfiguration]
    return: true | undefined
  }

  /** Start RTU server on a UUID with serial config */
  ['start_rtu_server']: {
    args: [StartRtuServerParams]
    return: void
  }

  /** Stop the active RTU server */
  ['stop_rtu_server']: {
    args: []
    return: void
  }

  /**
   * Whether the RTU server is running right now.
   *
   * `rtu_server_status` is addressed to the window showing the server, so a
   * window that was not that window when the last one went out has nothing to
   * catch up on. This is how it asks, and it answers what that event carries,
   * the way `get_client_states` answers what `client_state` carries.
   */
  ['get_rtu_server_status']: {
    args: []
    return: boolean
  }

  /**
   * The port of every server main holds a TCP listener for, by uuid.
   *
   * The split out server window asks it in place of opening the servers again,
   * so it knows which ones the main window's `init` opened.
   */
  ['get_server_ports']: {
    args: []
    return: Record<string, number>
  }

  /** Stop all running TCP servers (cleanup before RTU switch) */
  ['stop_all_tcp_servers']: {
    args: []
    return: void
  }

  /** Report whether a port is blocked by the Linux unprivileged-port floor */
  ['get_privileged_port_status']: {
    args: [number]
    return: PrivilegedPortStatus
  }

  /** Lower the Linux unprivileged-port floor via pkexec */
  ['apply_privileged_port_fix']: {
    args: [PrivilegedPortFixMode]
    return: PrivilegedPortFixResult | undefined
  }

  /** Report whether this user may open a serial port on Linux */
  ['get_serial_group_status']: {
    args: []
    return: SerialGroupStatus
  }

  /** Add this user to the serial group via pkexec */
  ['apply_serial_group_fix']: {
    args: []
    return: SerialGroupFixResult
  }

  /** Ask the desktop session to log the user out, so a new group takes effect */
  ['request_logout']: {
    args: []
    return: boolean
  }

  /** Hand main the connector's settings, and say whether it listens now. */
  ['set_mcp_settings']: {
    args: [McpSettings]
    return: McpStatus | undefined
  }

  /** Make a new token. Only its digest is kept; the token is shown once. */
  ['create_mcp_token']: {
    args: []
    return: McpToken
  }
}

export type IpcHandlerMap = {
  [K in IpcChannel]: IpcHandlerSpec[K]
}

/**
 * The events main pushes to a window.
 *
 * `windows.send` takes one of these and `onEvent` in the renderer listens for
 * one, so the pair that carries an event is named by the list it is in. They
 * sat in one list with the other direction, and a single list makes
 * `windows.send('open_server_window', undefined)` and
 * `onEvent('open_server_window', ...)` both typecheck, neither of which has
 * anything at the far end.
 */
const EVENTS_TO_RENDERER = [
  'backend_message',
  'client_state',
  'register_data',
  'transaction',
  'scan_unit_id_result',
  'scan_progress',
  'register_value',
  'window_update',
  'address_groups',
  'rtu_server_status',
  'mcp_call'
] as const

/** The events a window pushes to main. `sendEvent` there, `onIpcEvent` here. */
const EVENTS_TO_MAIN = ['open_server_window', 'mcp_result'] as const

export type EventToRenderer = (typeof EVENTS_TO_RENDERER)[number]
export type EventToMain = (typeof EVENTS_TO_MAIN)[number]

export interface IpcEventPayloadMap {
  ['backend_message']: [BackendMessage]
  ['client_state']: [ClientStateEvent]
  ['register_data']: [RegisterDataEvent]
  ['transaction']: [TransactionEvent]
  ['scan_unit_id_result']: [ScanUnitIdResultEvent]
  ['scan_progress']: [ScanProgressEvent]
  ['register_value']: [RegisterValue]
  ['window_update']: [WindowsOpen]
  ['open_server_window']: []
  ['address_groups']: [AddressGroupsEvent]
  ['rtu_server_status']: [boolean]
  ['mcp_call']: [McpCall]
  ['mcp_result']: [McpResult]
}

export interface BackendMessage {
  message: string
  variant: SharedProps['variant']
  error: unknown | null
}

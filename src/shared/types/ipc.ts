import type {
  ConnectionConfig,
  DeepPartial,
  RegisterConfig,
  RemoveRegisterParams,
  ScanRegistersParameters,
  ScanUnitIDParameters,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  ServerEndianness,
  WriteParameters,
  RegisterMapping,
  ResetRegistersParams,
  ResetBoolsParams,
  CreateServerParams,
  ClientState,
  AddRegisterParams,
  RegisterData,
  Transaction,
  ScanUnitIDResult,
  RegisterValue,
  AddressGroup,
  SerialPortInfo,
  SerialPortValidationResult,
  StartRtuServerParams,
  PrivilegedPortStatus,
  PrivilegedPortFixMode,
  PrivilegedPortFixResult,
  SerialGroupStatus,
  SerialGroupFixResult
} from '@shared'
import { SharedProps } from 'notistack'

/**
 * Which windows are open, as `window_update` carries it.
 *
 * The handles live in main's `Windows`; this is the renderer's half of that,
 * which is why it sits with the event that carries it.
 */
export interface WindowsOpen {
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
  'update_connection_config',
  'update_register_config',
  'get_client_state',
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
  'stop_all_tcp_servers',
  'get_privileged_port_status',
  'apply_privileged_port_fix',
  'get_serial_group_status',
  'apply_serial_group_fix',
  'request_logout'
] as const

export type IpcChannel = (typeof IPC_CHANNELS)[number]

/**
 * IpcHandlerMap associates each IpcChannel with:
 * - args: the argument types that the renderer needs to pass
 * - return: the type that the handler in the main/backend returns
 *
 * ! NOTE: The keys below MUST exactly match IpcChannel.
 * ! If you add a channel to IPC_CHANNELS, add it here.
 * ! If you remove one, remove it here. No extras allowed.
 */
export interface IpcHandlerSpec {
  /**
   * Update the ConnectionConfig (DeepPartial), and say whether it was taken.
   *
   * `true` is the whole answer, because main merges exactly the payload it was
   * given. A refusal answers `undefined`, which is what `createIpcHandle` sends
   * back, and the store keeps what it had.
   */
  ['update_connection_config']: {
    args: [DeepPartial<ConnectionConfig>]
    return: true | undefined
  }

  /** Update the RegisterConfig (DeepPartial), and say whether it was taken. */
  ['update_register_config']: {
    args: [DeepPartial<RegisterConfig>]
    return: true | undefined
  }

  /**
   * What the client is doing right now.
   *
   * `client_state` is pushed on a change, so a window that opens after the last
   * push has nothing to catch up on and starts on the initial literal. This is
   * how it asks.
   */
  ['get_client_state']: {
    args: []
    return: ClientState
  }

  /** Set the RegisterMapping */
  ['set_register_mapping']: {
    args: [RegisterMapping]
    return: void
  }

  /** Connect the Modbus client */
  ['connect']: {
    args: []
    return: void
  }

  /** Disconnect the Modbus client */
  ['disconnect']: {
    args: []
    return: void
  }

  /** Read registers (returns RegisterData[] or undefined) */
  ['read']: {
    args: []
    return: void
  }

  /** Start polling on the Modbus client */
  ['start_polling']: {
    args: []
    return: void
  }

  /** Stop polling on the Modbus client */
  ['stop_polling']: {
    args: []
    return: void
  }

  /** Write to registers via the Modbus client */
  ['write']: {
    args: [WriteParameters]
    return: void
  }

  /** Start scanning for unit IDs */
  ['scan_unit_ids']: {
    args: [ScanUnitIDParameters]
    return: void
  }

  /** Stop scanning for unit IDs */
  ['stop_scanning_unit_ids']: {
    args: []
    return: void
  }

  /** Start scanning registers */
  ['scan_registers']: {
    args: [ScanRegistersParameters]
    return: void
  }

  /** Stop scanning registers */
  ['stop_scanning_registers']: {
    args: []
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
    return: Promise<number | undefined>
  }

  /** Create a new server */
  ['create_server']: {
    args: [CreateServerParams]
    return: Promise<number | undefined>
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

  /** Set the readConfiguration flag (session-only, not persisted) */
  ['set_read_configuration']: {
    args: [boolean]
    return: void
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
   * catch up on. This is how it asks, the same shape as `get_client_state`.
   */
  ['get_rtu_server_status']: {
    args: []
    return: boolean
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
    return: Promise<PrivilegedPortFixResult | undefined>
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
}

export type IpcHandlerMap = {
  [K in IpcChannel]: IpcHandlerSpec[K]
}

/**
 * Events emitted
 */
export const IPC_EVENTS = [
  'backend_message',
  'client_state',
  'register_data',
  'transaction',
  'scan_unit_id_result',
  'scan_progress',
  'register_value',
  'window_update',
  'open_server_window',
  'address_groups',
  'rtu_server_status'
] as const

export type IpcEvent = (typeof IPC_EVENTS)[number]

export interface IpcEventPayloadMap {
  ['backend_message']: [BackendMessage]
  ['client_state']: [ClientState]
  ['register_data']: [RegisterData[]]
  ['transaction']: [Transaction]
  ['scan_unit_id_result']: [ScanUnitIDResult]
  ['scan_progress']: [number]
  ['register_value']: [RegisterValue]
  ['window_update']: [WindowsOpen]
  ['open_server_window']: []
  ['address_groups']: [AddressGroup[]]
  ['rtu_server_status']: [{ active: boolean }]
}

export interface BackendMessage {
  message: string
  variant: SharedProps['variant']
  error: unknown | null
}

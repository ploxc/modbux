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
  WriteParameters,
  RegisterMapping,
  ResetRegistersParams,
  ResetBoolsParams,
  CreateServerParams,
  SetUnitIdParams,
  ClientState,
  AddRegisterParams,
  RegisterData,
  Transaction,
  ScanUnitIDResult,
  RegisterValue,
  BooleanValue,
  WindowsOpen,
  AddressGroup
} from '@shared'
import { SharedProps } from 'notistack'

export const IPC_CHANNELS = [
  'get_connection_config',
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
  'reset_registers',
  'set_bool',
  'reset_bools',
  'sync_bools',
  'restart_server',
  'set_server_port',
  'set_server_unit_id',
  'get_app_version',
  'create_server',
  'delete_server'
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
  /** Retrieve the ConnectionConfig */
  ['get_connection_config']: {
    args: []
    return: ConnectionConfig
  }

  /** Update the ConnectionConfig (DeepPartial) */
  ['update_connection_config']: {
    args: [DeepPartial<ConnectionConfig>]
    return: void
  }

  /** Update the RegisterConfig (DeepPartial) */
  ['update_register_config']: {
    args: [DeepPartial<RegisterConfig>]
    return: void
  }

  /** Retrieve the current ClientState */
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

  /** Add or replace a server register */
  ['add_replace_server_register']: {
    args: [AddRegisterParams]
    return: void
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

  /** Restart the server (UUID) */
  ['restart_server']: {
    args: [string]
    return: void
  }

  /** Set the server port */
  ['set_server_port']: {
    args: [CreateServerParams]
    return: void
  }

  /** Set the server unit ID */
  ['set_server_unit_id']: {
    args: [SetUnitIdParams]
    return: void
  }

  /** Create a new server */
  ['create_server']: {
    args: [CreateServerParams]
    return: void
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
  'boolean_value',
  'window_update',
  'open_server_window',
  'address_groups'
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
  ['boolean_value']: [BooleanValue]
  ['window_update']: [WindowsOpen]
  ['open_server_window']: []
  ['address_groups']: [AddressGroup[]]
}

export interface BackendMessage {
  message: string
  variant: SharedProps['variant']
  error: unknown | null
}

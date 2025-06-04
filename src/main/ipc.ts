import { AppState } from './state'
import {
  ScanRegistersParameters,
  ConnectionConfigSchema,
  defaultConnectionConfig,
  ClientStateSchema,
  defaultClientState,
  IpcHandlerMap,
  IpcEvent,
  IpcEventPayloadMap
} from '@shared'
import { ModbusClient } from './modules/modbusClient'
import { ModbusServer } from './modules/mobusServer'
import { IpcMainEvent, IpcMainInvokeEvent, ipcMain } from 'electron'

export const ipcHandle = <C extends keyof IpcHandlerMap>(
  channel: C,
  listener: (
    event: IpcMainInvokeEvent,
    ...args: IpcHandlerMap[C]['args']
  ) => Promise<IpcHandlerMap[C]['return']> | IpcHandlerMap[C]['return']
): void => {
  ipcMain.handle(channel, listener)
}

type InitIpcFn = (
  app: Electron.App,
  state: AppState,
  client: ModbusClient,
  server: ModbusServer
) => void

export const initIpc: InitIpcFn = (app, state, client, server) => {
  // Connnection config
  ipcHandle('get_connection_config', () => {
    // Validate and return the current connection config, or default if invalid
    const result = ConnectionConfigSchema.safeParse(state.connectionConfig)
    if (result.success) return result.data
    state.updateConnectionConfig(defaultConnectionConfig)
    return defaultConnectionConfig
  })
  ipcHandle('update_connection_config', (_, config) => state.updateConnectionConfig(config))

  // Register config
  ipcHandle('update_register_config', (_, config) => state.updateRegisterConfig(config))

  // Client state
  ipcHandle('get_client_state', () => {
    // Validate and return the current client state, or default if invalid
    const result = ClientStateSchema.safeParse(client.state)
    if (result.success) return result.data
    return defaultClientState
  })
  ipcHandle('set_register_mapping', (_, mapping) => state.setRegisterMapping(mapping))

  // Connection Actions
  ipcHandle('connect', () => client.connect())
  ipcHandle('disconnect', () => client.disconnect())

  // Read Actions
  ipcHandle('read', () => client.read())
  ipcHandle('start_polling', () => client.startPolling())
  ipcHandle('stop_polling', () => client.stopPolling())

  // Write Actions
  ipcHandle('write', (_, writeParameters) => client.write(writeParameters))

  // Scan Unit ID Actions
  ipcHandle('scan_unit_ids', (_, scanUnitIdParameters) => client.scanUnitIds(scanUnitIdParameters))
  ipcHandle('stop_scanning_unit_ids', () => client.stopScanningUnitIds())

  // Scan Registers Actions
  ipcHandle('scan_registers', (_, scanRegistersParameters: ScanRegistersParameters) =>
    client.scanRegisters(scanRegistersParameters)
  )
  ipcHandle('stop_scanning_registers', () => client.stopScanningRegisters())

  // Server
  ipcHandle('add_replace_server_register', (_, params) => server.addRegister(params))
  ipcHandle('remove_server_register', (_, params) => server.removeRegister(params))
  ipcHandle('sync_server_register', (_, params) => server.syncServerRegisters(params))
  ipcHandle('reset_registers', (_, params) => server.resetRegisters(params))
  ipcHandle('set_bool', (_, params) => server.setBool(params))
  ipcHandle('reset_bools', (_, params) => server.resetBools(params))
  ipcHandle('sync_bools', (_, params) => server.syncBools(params))
  ipcHandle('reset_server', (_, uuid) => server.resetServer(uuid))
  ipcHandle('set_server_port', (_, params) => server.setPort(params))
  ipcHandle('create_server', (_, params) => server.createServer(params))
  ipcHandle('delete_server', (_, uuid) => server.deleteServer(uuid))

  // App Version
  ipcHandle('get_app_version', () => app.getVersion())
}

/**
 * Register a listener for an IPC event on the main process:
 * - E must be one of the keys in IpcEvent.
 * - listener receives the IpcMainEvent plus the payload tuple defined in IpcEventPayloadMap[E].
 */
export function onIpcEvent<E extends IpcEvent>(
  event: E,
  listener: (event: IpcMainEvent, ...args: IpcEventPayloadMap[E]) => void
): void {
  ipcMain.on(event, (ev, ...args) => {
    listener(ev, ...(args as IpcEventPayloadMap[E]))
  })
}

/**
 * Remove all listeners for a specific IPC event on the main process.
 */
export function offIpcEvent<E extends IpcEvent>(event: E): void {
  ipcMain.removeAllListeners(event)
}

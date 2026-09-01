import { AppState } from './state'
import {
  ScanRegistersParameters,
  ConnectionConfigSchema,
  defaultConnectionConfig,
  ClientStateSchema,
  defaultClientState,
  IpcHandlerMap,
  IpcEvent,
  IpcEventPayloadMap,
  Windows,
  formatZodError,
  WriteParametersSchema,
  AddRegisterParamsSchema,
  SetBooleanParametersSchema,
  CreateServerParamsSchema,
  PrivilegedPortFixModeSchema,
  RegisterConfigSchema,
  RegisterMappingSchema,
  RemoveRegisterParamsSchema,
  ResetBoolsParamsSchema,
  ResetRegistersParamsSchema,
  ScanRegistersParametersSchema,
  ScanUnitIDParametersSchema,
  StartRtuServerParamsSchema,
  SyncBoolsParametersSchema,
  SyncRegisterValueParamsSchema
} from '@shared'
import { ModbusClient } from './modules/modbusClient'
import { ModbusServer } from './modules/modbusServer'
import { applyPrivilegedPortFix, getPrivilegedPortStatus } from './modules/privilegedPort'
import { applySerialGroupFix, getSerialGroupStatus, requestLogout } from './modules/serialGroup'
import { IpcMainEvent, IpcMainInvokeEvent, ipcMain } from 'electron'
import type { ZodType } from 'zod'

type IpcListener<C extends keyof IpcHandlerMap> = (
  event: IpcMainInvokeEvent,
  ...args: IpcHandlerMap[C]['args']
) => Promise<IpcHandlerMap[C]['return']> | IpcHandlerMap[C]['return']

/**
 * A schema may only guard a channel where `undefined` is an honest answer.
 *
 * A rejected payload leaves nothing to return. A channel answering `void` has
 * nothing to return anyway; a channel answering a value has to say so in its
 * type, because `create_server` hands back the port it actually bound and the
 * renderer writes that straight into the port field. A stand-in number would
 * show up there as a real one, and so would `String(undefined)`.
 */
type PayloadSchema<C extends keyof IpcHandlerMap> =
  undefined extends Awaited<IpcHandlerMap[C]['return']>
    ? ZodType<IpcHandlerMap[C]['args'][0]>
    : never

/**
 * Builds the `ipcHandle` used below, bound to the windows it reports through.
 *
 * A guarded channel hands the handler the *parsed* payload, not the one that
 * arrived, so anything the schema does not describe is stripped before it can
 * reach a Modbus socket.
 *
 * A rejected payload comes back as a `backend_message`, never as a throw. An
 * error crossing the IPC boundary surfaces in the renderer as an unhandled
 * rejection carrying the channel name and nothing else, which is exactly the
 * failure the Linux helpers avoid by returning results instead of throwing.
 */
export const createIpcHandle =
  (windows: Windows) =>
  <C extends keyof IpcHandlerMap>(
    channel: C,
    listener: IpcListener<C>,
    schema?: PayloadSchema<C>
  ): void => {
    if (!schema) {
      ipcMain.handle(channel, listener)
      return
    }

    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const result = schema.safeParse(args[0])

      if (!result.success) {
        windows.send('backend_message', {
          message: 'Invalid request, nothing was changed',
          variant: 'error',
          error: `${channel}: ${formatZodError(result.error)}`
        })
        return undefined
      }

      return listener(event, ...([result.data] as IpcHandlerMap[C]['args']))
    })
  }

type InitIpcFn = (
  app: Electron.App,
  state: AppState,
  client: ModbusClient,
  server: ModbusServer,
  windows: Windows
) => void

export const initIpc: InitIpcFn = (app, state, client, server, windows) => {
  const ipcHandle = createIpcHandle(windows)

  // Connection config
  ipcHandle('get_connection_config', () => {
    // Validate and return the current connection config, or default if invalid
    const result = ConnectionConfigSchema.safeParse(state.connectionConfig)
    if (result.success) return result.data
    state.updateConnectionConfig(defaultConnectionConfig)
    return defaultConnectionConfig
  })
  ipcHandle(
    'update_connection_config',
    (_, config) => state.updateConnectionConfig(config),
    ConnectionConfigSchema.deepPartial()
  )

  // Register config
  ipcHandle(
    'update_register_config',
    (_, config) => state.updateRegisterConfig(config),
    RegisterConfigSchema.deepPartial()
  )

  // Client state
  ipcHandle('get_client_state', () => {
    // Validate and return the current client state, or default if invalid
    const result = ClientStateSchema.safeParse(client.state)
    if (result.success) return result.data
    return defaultClientState
  })
  ipcHandle(
    'set_register_mapping',
    (_, mapping) => state.setRegisterMapping(mapping),
    RegisterMappingSchema
  )

  // Connection Actions
  ipcHandle('connect', () => client.connect())
  ipcHandle('disconnect', () => client.disconnect())

  // Read Actions
  ipcHandle('read', () => client.read())
  ipcHandle('start_polling', () => client.startPolling())
  ipcHandle('stop_polling', () => client.stopPolling())

  // Write Actions
  ipcHandle('write', (_, writeParameters) => client.write(writeParameters), WriteParametersSchema)

  // Scan Unit ID Actions
  ipcHandle(
    'scan_unit_ids',
    (_, scanUnitIdParameters) => client.scanUnitIds(scanUnitIdParameters),
    ScanUnitIDParametersSchema
  )
  ipcHandle('stop_scanning_unit_ids', () => client.stopScanningUnitIds())

  // Scan Registers Actions
  ipcHandle(
    'scan_registers',
    (_, scanRegistersParameters: ScanRegistersParameters) =>
      client.scanRegisters(scanRegistersParameters),
    ScanRegistersParametersSchema
  )
  ipcHandle('stop_scanning_registers', () => client.stopScanningRegisters())

  // Server
  ipcHandle(
    'add_replace_server_register',
    (_, params) => server.addRegister(params),
    AddRegisterParamsSchema
  )
  ipcHandle(
    'remove_server_register',
    (_, params) => server.removeRegister(params),
    RemoveRegisterParamsSchema
  )
  ipcHandle(
    'sync_server_register',
    (_, params) => server.syncServerRegisters(params),
    SyncRegisterValueParamsSchema
  )
  ipcHandle(
    'reset_registers',
    (_, params) => server.resetRegisters(params),
    ResetRegistersParamsSchema
  )
  ipcHandle('set_bool', (_, params) => server.setBool(params), SetBooleanParametersSchema)
  ipcHandle('reset_bools', (_, params) => server.resetBools(params), ResetBoolsParamsSchema)
  ipcHandle('sync_bools', (_, params) => server.syncBools(params), SyncBoolsParametersSchema)
  ipcHandle('reset_server', (_, uuid) => server.resetServer(uuid))
  ipcHandle('set_server_port', (_, params) => server.setPort(params), CreateServerParamsSchema)
  ipcHandle('create_server', (_, params) => server.createServer(params), CreateServerParamsSchema)
  ipcHandle('delete_server', (_, uuid) => server.deleteServer(uuid))

  // RTU Server
  ipcHandle(
    'start_rtu_server',
    (_, params) => server.startRtuServer(params),
    StartRtuServerParamsSchema
  )
  ipcHandle('stop_rtu_server', () => server.stopRtuServer())
  ipcHandle('stop_all_tcp_servers', () => server.stopAllTcpServers())

  // App Version
  ipcHandle('get_app_version', () => app.getVersion())

  // Read configuration (session-only toggle)
  ipcHandle('set_read_configuration', (_, value) => state.setReadConfiguration(value))

  // Linux privileged ports (port 502 needs the unprivileged-port floor lowered)
  ipcHandle('get_privileged_port_status', (_, port) => getPrivilegedPortStatus(port))
  ipcHandle(
    'apply_privileged_port_fix',
    (_, mode) => applyPrivilegedPortFix(mode),
    PrivilegedPortFixModeSchema
  )
  ipcHandle('get_serial_group_status', () => getSerialGroupStatus())
  ipcHandle('apply_serial_group_fix', () => applySerialGroupFix())
  ipcHandle('request_logout', () => requestLogout())

  // Serial port discovery
  ipcHandle('list_serial_ports', () => client.listSerialPorts())
  ipcHandle('validate_serial_port', (_, portPath) => client.validateSerialPort(portPath))
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

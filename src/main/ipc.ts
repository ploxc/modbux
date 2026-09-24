import {
  BackendMessage,
  ClientConnectionConfigUpdateSchema,
  ClientReadConfigurationSchema,
  ClientRegisterConfigUpdateSchema,
  ClientRegisterMappingSchema,
  ClientScanRegistersSchema,
  ClientScanUnitIdsSchema,
  ClientCreateSchema,
  ClientUuidSchema,
  ClientWriteSchema,
  IpcHandlerMap,
  EventToMain,
  IpcEventPayloadMap,
  formatZodError,
  AddRegisterParamsSchema,
  SetBooleanParametersSchema,
  CreateServerParamsSchema,
  PrivilegedPortFixModeSchema,
  RemoveRegisterParamsSchema,
  ResetBoolsParamsSchema,
  ResetRegistersParamsSchema,
  StartRtuServerParamsSchema,
  SyncBoolsParametersSchema,
  SyncRegisterValueParamsSchema,
  ServerEndiannessSchema,
  ServerUuidSchema
} from '@shared'
import { Windows } from './windows'
import { Clients } from './modules/modbusClient/clients'
import * as serialPorts from './modules/modbusClient/serialPorts'
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
 * A channel this boundary can carry, which is one declaring `[]` or a tuple of
 * exactly one.
 *
 * `createIpcHandle` parses `args[0]` and calls the listener with
 * `[result.data]`, and `PayloadSchema<C>` names `args[0]` alone. A second
 * argument is therefore dropped where a schema guards the channel and reaches
 * the handler unvalidated where none does. Every spec entry declares `[]` or a
 * one element tuple today, and a channel declaring two is refused here rather
 * than losing one of them quietly.
 *
 * `[T?]` and `T[]` are refused as well, and deliberately: the arity is what a
 * reader of `args` counts, so a channel says how many it takes rather than how
 * many it might.
 */
type OneArgumentChannel = {
  [C in keyof IpcHandlerMap]: IpcHandlerMap[C]['args'] extends [] | [unknown] ? C : never
}[keyof IpcHandlerMap]

/** A channel a refusal has an answer for, which is the same rule as above. */
type RefusableChannel = {
  [C in keyof IpcHandlerMap]: undefined extends Awaited<IpcHandlerMap[C]['return']> ? C : never
}[keyof IpcHandlerMap]

/**
 * The channels that drive main's Modbus clients, answered for `windows.main`
 * alone.
 *
 * Each names a client by uuid, and any window can name any uuid. Both windows
 * load the same renderer bundle, so both hold the client store; the near-term
 * cost was its module scope calling `set_read_configuration` and
 * `stop_scanning_unit_ids` from the split out server window, which
 * `client.zustand.ts` now gates on `isServerWindow`. This side is the rule
 * rather than the instance: a caller added to that module later, or a client
 * component mounted in the server window, reaches the same clients.
 *
 * `get_client_states` is not here: it answers a record rather than
 * `undefined`, and reading what main is doing changes nothing about it.
 */
const CLIENT_CHANNELS: readonly RefusableChannel[] = [
  'create_client',
  'delete_client',
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
  'update_connection_config',
  'update_register_config',
  'set_register_mapping',
  'set_read_configuration'
]

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
 *
 * It goes back to the window that asked. Broadcasting it reached whichever
 * windows were listening, which in split view was the main one, so a payload
 * refused on a channel the server window owns reported into a window the user
 * was not looking at.
 *
 * A channel in `CLIENT_CHANNELS` is refused the same way when it comes from a
 * window that is not `windows.main`, and that question is asked before the
 * schema, because the payload is beside the point once the asker is wrong.
 */
export const createIpcHandle =
  (windows: Windows) =>
  <C extends OneArgumentChannel>(
    channel: C,
    listener: IpcListener<C>,
    schema?: PayloadSchema<C>
  ): void => {
    const drivesTheClient = (CLIENT_CHANNELS as readonly string[]).includes(channel)

    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (drivesTheClient && !windows.isMain(event.sender)) {
        windows.send(
          'backend_message',
          {
            message: 'The Modbus client is driven from the main window',
            variant: 'error',
            error: `${channel}: refused, the asking window is not the main one`
          },
          event.sender
        )
        return undefined
      }

      if (!schema) return listener(event, ...(args as IpcHandlerMap[C]['args']))

      const result = schema.safeParse(args[0])

      if (!result.success) {
        windows.send(
          'backend_message',
          {
            message: 'Invalid request, nothing was changed',
            variant: 'error',
            error: `${channel}: ${formatZodError(result.error)}`
          },
          event.sender
        )
        return undefined
      }

      return listener(event, ...([result.data] as IpcHandlerMap[C]['args']))
    })
  }

type InitIpcFn = (
  app: Electron.App,
  clients: Clients,
  server: ModbusServer,
  windows: Windows
) => void

export const initIpc: InitIpcFn = (app, clients, server, windows) => {
  const ipcHandle = createIpcHandle(windows)

  /** What a failed port enumeration says, in the window the client view is drawn in. */
  const toMainWindow = (message: BackendMessage): void =>
    windows.send('backend_message', message, 'main')

  // Clients
  ipcHandle(
    'create_client',
    (_, { uuid, ...config }) => clients.create(uuid, config),
    ClientCreateSchema
  )
  ipcHandle('delete_client', (_, uuid) => clients.delete(uuid), ClientUuidSchema)
  ipcHandle('get_client_states', () => clients.states())

  // Configuration
  ipcHandle(
    'update_connection_config',
    (_, update) => clients.updateConnectionConfig(update),
    ClientConnectionConfigUpdateSchema
  )
  ipcHandle(
    'update_register_config',
    (_, update) => clients.updateRegisterConfig(update),
    ClientRegisterConfigUpdateSchema
  )
  ipcHandle(
    'set_register_mapping',
    (_, update) => clients.setRegisterMapping(update),
    ClientRegisterMappingSchema
  )
  // Read configuration (session-only toggle)
  ipcHandle(
    'set_read_configuration',
    (_, update) => clients.setReadConfiguration(update),
    ClientReadConfigurationSchema
  )

  // Connection Actions
  ipcHandle('connect', (_, uuid) => clients.get(uuid)?.connect(), ClientUuidSchema)
  ipcHandle('disconnect', (_, uuid) => clients.get(uuid)?.disconnect(), ClientUuidSchema)

  // Read Actions
  ipcHandle('read', (_, uuid) => clients.get(uuid)?.read(), ClientUuidSchema)
  ipcHandle('start_polling', (_, uuid) => clients.get(uuid)?.startPolling(), ClientUuidSchema)
  ipcHandle('stop_polling', (_, uuid) => clients.get(uuid)?.stopPolling(), ClientUuidSchema)

  // Write Actions
  ipcHandle(
    'write',
    (_, { uuid, parameters }) => clients.get(uuid)?.write(parameters),
    ClientWriteSchema
  )

  // Scan Unit ID Actions
  ipcHandle(
    'scan_unit_ids',
    (_, { uuid, parameters }) => clients.get(uuid)?.scanUnitIds(parameters),
    ClientScanUnitIdsSchema
  )
  ipcHandle(
    'stop_scanning_unit_ids',
    (_, uuid) => clients.get(uuid)?.stopScanningUnitIds(),
    ClientUuidSchema
  )

  // Scan Registers Actions
  ipcHandle(
    'scan_registers',
    (_, { uuid, parameters }) => clients.get(uuid)?.scanRegisters(parameters),
    ClientScanRegistersSchema
  )
  ipcHandle(
    'stop_scanning_registers',
    (_, uuid) => clients.get(uuid)?.stopScanningRegisters(),
    ClientUuidSchema
  )

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
    'set_server_endianness',
    (_, params) => server.setEndianness(params),
    ServerEndiannessSchema
  )
  ipcHandle(
    'reset_registers',
    (_, params) => server.resetRegisters(params),
    ResetRegistersParamsSchema
  )
  ipcHandle('set_bool', (_, params) => server.setBool(params), SetBooleanParametersSchema)
  ipcHandle('reset_bools', (_, params) => server.resetBools(params), ResetBoolsParamsSchema)
  ipcHandle('sync_bools', (_, params) => server.syncBools(params), SyncBoolsParametersSchema)
  ipcHandle('reset_server', (_, uuid) => server.resetServer(uuid), ServerUuidSchema)
  ipcHandle('set_server_port', (_, params) => server.setPort(params), CreateServerParamsSchema)
  ipcHandle('create_server', (_, params) => server.createServer(params), CreateServerParamsSchema)
  ipcHandle('delete_server', (_, uuid) => server.deleteServer(uuid), ServerUuidSchema)

  // RTU Server
  ipcHandle(
    'start_rtu_server',
    (_, params) => server.startRtuServer(params),
    StartRtuServerParamsSchema
  )
  ipcHandle('stop_rtu_server', () => server.stopRtuServer())
  ipcHandle('get_rtu_server_status', () => server.rtuActive)
  ipcHandle('stop_all_tcp_servers', () => server.stopAllTcpServers())

  // App Version
  ipcHandle('get_app_version', () => app.getVersion())

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
  ipcHandle('list_serial_ports', () => serialPorts.listSerialPorts(toMainWindow))
  ipcHandle('validate_serial_port', (_, portPath) =>
    serialPorts.validateSerialPort(portPath, toMainWindow)
  )
}

/**
 * Register a listener for an IPC event on the main process:
 * - E must be one of `EVENTS_TO_MAIN`, which is the direction this hears.
 * - listener receives the IpcMainEvent plus the payload tuple defined in IpcEventPayloadMap[E].
 */
export function onIpcEvent<E extends EventToMain>(
  event: E,
  listener: (event: IpcMainEvent, ...args: IpcEventPayloadMap[E]) => void
): void {
  ipcMain.on(event, (ev, ...args) => {
    listener(ev, ...(args as IpcEventPayloadMap[E]))
  })
}

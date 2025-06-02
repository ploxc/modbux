import { AppState } from './state'
import {
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
  AddRegisterParams,
  ConnectionConfigSchema,
  defaultConnectionConfig,
  defaultRegisterConfig,
  RegisterConfigSchema,
  ClientState,
  ClientStateSchema,
  defaultClientState
} from '@shared'
import { ModbusClient } from './modules/modbusClient'
import { ModbusServer } from './modules/mobusServer'
import { ipcHandle, IpcChannel } from '@backend'

export const initIpc = (
  app: Electron.App,
  state: AppState,
  client: ModbusClient,
  server: ModbusServer
) => {
  // Connnection config
  ipcHandle(IpcChannel.GetConnectionConfig, (): ConnectionConfig => {
    // Validate and return the current connection config, or default if invalid
    const result = ConnectionConfigSchema.safeParse(state.connectionConfig)
    if (result.success) return result.data
    state.updateConnectionConfig(defaultConnectionConfig)
    return defaultConnectionConfig
  })
  ipcHandle(IpcChannel.UpdateConnectionConfig, (_, config: DeepPartial<ConnectionConfig>) =>
    state.updateConnectionConfig(config)
  )
  // Register config
  ipcHandle(IpcChannel.GetRegisterConfig, (): RegisterConfig => {
    // Validate and return the current register config, or default if invalid
    const result = RegisterConfigSchema.safeParse(state.registerConfig)
    if (result.success) return result.data
    state.updateRegisterConfig(defaultRegisterConfig)
    return defaultRegisterConfig
  })
  ipcHandle(IpcChannel.UpdateRegisterConfig, (_, config: DeepPartial<RegisterConfig>) =>
    state.updateRegisterConfig(config)
  )
  // Client state
  ipcHandle(IpcChannel.GetClientState, (): ClientState => {
    // Validate and return the current client state, or default if invalid
    const result = ClientStateSchema.safeParse(client.state)
    if (result.success) return result.data
    return defaultClientState
  })
  ipcHandle(IpcChannel.SetRegisterMapping, (_, mapping: RegisterMapping) =>
    state.setRegisterMapping(mapping)
  )

  // Connection Actions
  ipcHandle(IpcChannel.Connect, () => client.connect())
  ipcHandle(IpcChannel.Disconnect, () => client.disconnect())

  // Read Actions
  ipcHandle(IpcChannel.Read, () => client.read())
  ipcHandle(IpcChannel.StartPolling, () => client.startPolling())
  ipcHandle(IpcChannel.StopPolling, () => client.stopPolling())

  // Write Actions
  ipcHandle(IpcChannel.Write, (_, writeParameters: WriteParameters) =>
    client.write(writeParameters)
  )

  // Scan Unit ID Actions
  ipcHandle(IpcChannel.ScanUnitIds, (_, scanUnitIdParameters: ScanUnitIDParameters) =>
    client.scanUnitIds(scanUnitIdParameters)
  )
  ipcHandle(IpcChannel.StopScanningUnitIds, () => client.stopScanningUnitIds())

  // Scan Registers Actions
  ipcHandle(IpcChannel.ScanRegisters, (_, scanRegistersParameters: ScanRegistersParameters) =>
    client.scanRegisters(scanRegistersParameters)
  )
  ipcHandle(IpcChannel.StopScanningRegisters, () => client.stopScanningRegisters())

  // Server
  ipcHandle(IpcChannel.AddReplaceServerRegister, (_, params: AddRegisterParams) =>
    server.addRegister(params)
  )
  ipcHandle(IpcChannel.RemoveServerRegister, (_, params: RemoveRegisterParams) =>
    server.removeRegisterValue(params)
  )
  ipcHandle(IpcChannel.SyncServerRegisters, (_, params: SyncRegisterValueParams) =>
    server.syncServerRegisters(params)
  )
  ipcHandle(IpcChannel.ResetRegisters, (_, params: ResetRegistersParams) =>
    server.resetRegisters(params)
  )
  ipcHandle(IpcChannel.SetBool, (_, params: SetBooleanParameters) => server.setBool(params))
  ipcHandle(IpcChannel.ResetBools, (_, params: ResetBoolsParams) => server.resetBools(params))
  ipcHandle(IpcChannel.SyncBools, (_, params: SyncBoolsParameters) => server.syncBools(params))
  ipcHandle(IpcChannel.RestartServer, (_, uuid: string) => server.restartServer(uuid))
  ipcHandle(IpcChannel.SetServerPort, (_, params: CreateServerParams) => server.setPort(params))
  ipcHandle(IpcChannel.SetServerUnitId, (_, params: SetUnitIdParams) => server.setId(params))
  ipcHandle(IpcChannel.CreateServer, (_, params: CreateServerParams) => server.createServer(params))
  ipcHandle(IpcChannel.DeleteServer, (_, uuid: string) => server.deleteServer(uuid))

  ipcHandle(IpcChannel.GetAppVersion, () => app.getVersion())
}

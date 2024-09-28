import { AppState } from './state'
import {
  ConnectionConfig,
  DeepPartial,
  RegisterConfig,
  RemoveRegisterValueParams,
  ScanRegistersParameters,
  ScanUnitIDParameters,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  RegisterValueParameters,
  WriteParameters
} from '@shared'
import { ModbusClient } from './modules/modbusClient'
import { ModbusServer } from './modules/mobusServer'
import { ipcHandle, IpcChannel } from '@backend'

export const initIpc = (state: AppState, client: ModbusClient, server: ModbusServer) => {
  // Config and state
  ipcHandle(IpcChannel.GetConnectionConfig, () => state.connectionConfig)
  ipcHandle(IpcChannel.UpdateConnectionConfig, (_, config: DeepPartial<ConnectionConfig>) =>
    state.updateConnectionConfig(config)
  )
  ipcHandle(IpcChannel.GetRegisterConfig, () => state.registerConfig)
  ipcHandle(IpcChannel.UpdateRegisterConfig, (_, config: DeepPartial<RegisterConfig>) =>
    state.updateRegisterConfig(config)
  )
  ipcHandle(IpcChannel.GetClientState, () => client.state)

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
  ipcHandle(IpcChannel.AddReplaceServerRegister, (_, params: RegisterValueParameters) =>
    server.addRegisterValue(params)
  )
  ipcHandle(IpcChannel.RemoveServerRegister, (_, params: RemoveRegisterValueParams) =>
    server.removeRegisterValue(params)
  )
  ipcHandle(IpcChannel.SyncServerRegisters, (_, params: SyncRegisterValueParams) =>
    server.syncServerRegisters(params)
  )
  ipcHandle(IpcChannel.SetBool, (_, params: SetBooleanParameters) => server.setBool(params))
  ipcHandle(IpcChannel.ResetBools, () => server.resetBools())
  ipcHandle(IpcChannel.SyncBools, (_, params: SyncBoolsParameters) => server.syncBools(params))
}

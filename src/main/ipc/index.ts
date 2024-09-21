import { AppState } from '../state'
import { ipcHandle, IpcChannel } from '@backend'
import {
  ConnectionConfig,
  DeepPartial,
  RegisterConfig,
  ScanUnitIDParameters,
  WriteParameters
} from '@shared'
import { ModbusClient } from '../modules/modbusClient'

export const initIpc = (state: AppState, client: ModbusClient) => {
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
  ipcHandle(IpcChannel.ScanUnitId, (_, scanUnitIdParameters: ScanUnitIDParameters) =>
    client.scanUnitId(scanUnitIdParameters)
  )
  ipcHandle(IpcChannel.StopScanningUnitId, () => client.stopScanningUnitId())
}

import { AppState } from '../state'
import { ipcHandle, IpcChannel } from '@backend'
import { ConnectionConfig, DeepPartial, RegisterConfig } from '@shared'

export const initIpc = (state: AppState) => {
  ipcHandle(IpcChannel.GetConnectionConfig, () => state.connectionConfig)
  ipcHandle(IpcChannel.UpdateConnectionConfig, (_, config: DeepPartial<ConnectionConfig>) =>
    state.updateConnectionConfig(config)
  )
  ipcHandle(IpcChannel.GetRegisterConfig, () => state.registerConfig)
  ipcHandle(IpcChannel.UpdateRegisterConfig, (_, config: DeepPartial<RegisterConfig>) =>
    state.updateRegisterConfig(config)
  )
}

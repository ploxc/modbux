import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  Api,
  ClientState,
  ConnectionConfig,
  RegisterConfig,
  RegisterData,
  ValueGeneratorsParamsReturn
} from '@shared'
import { IpcChannel, ipcInvoke } from '@backend'

const passedArgs = process.argv.slice(2)
const isServerWindow = passedArgs.includes('is-server-window')
//
//
// Custom APIs for renderer
const api: Api = {
  isServerWindow,
  getConnectionConfig: (...args) =>
    ipcInvoke<typeof args, ConnectionConfig>(IpcChannel.GetConnectionConfig),

  updateConnectionConfig: (...args) =>
    ipcInvoke<typeof args, void>(IpcChannel.UpdateConnectionConfig, ...args),

  getRegisterConfig: (...args) =>
    ipcInvoke<typeof args, RegisterConfig>(IpcChannel.GetRegisterConfig),

  updateRegisterConfig: (...args) =>
    ipcInvoke<typeof args, void>(IpcChannel.UpdateRegisterConfig, ...args),

  getClientState: (...args) =>
    ipcInvoke<typeof args, ClientState>(IpcChannel.GetClientState, ...args),

  // Connections
  connect: (...args) => ipcInvoke<typeof args, void>(IpcChannel.Connect, ...args),
  disconnect: (...args) => ipcInvoke<typeof args, void>(IpcChannel.Disconnect, ...args),

  // Read/Write
  read: (...args) => ipcInvoke<typeof args, RegisterData[] | undefined>(IpcChannel.Read, ...args),
  startPolling: (...args) => ipcInvoke<typeof args, void>(IpcChannel.StartPolling, ...args),
  stopPolling: (...args) => ipcInvoke<typeof args, void>(IpcChannel.StopPolling, ...args),
  write: (...args) => ipcInvoke<typeof args, void>(IpcChannel.Write, ...args),

  // Scan unit IDs
  scanUnitIds: (...args) => ipcInvoke<typeof args, void>(IpcChannel.ScanUnitIds, ...args),
  stopScanningUnitIds: (...args) =>
    ipcInvoke<typeof args, void>(IpcChannel.StopScanningUnitIds, ...args),

  // Scan registers
  scanRegisters: (...args) => ipcInvoke<typeof args, void>(IpcChannel.ScanRegisters, ...args),
  stopScanningRegisters: (...args) =>
    ipcInvoke<typeof args, void>(IpcChannel.StopScanningRegisters, ...args),

  // Server registers
  addReplaceServerRegister: (...args) =>
    ipcInvoke<typeof args, void>(IpcChannel.AddReplaceServerRegister, ...args),
  removeServerRegister: (...args) =>
    ipcInvoke<typeof args, void>(IpcChannel.RemoveServerRegister, ...args),
  getValueGeneratorParams: (...args) =>
    ipcInvoke<typeof args, ValueGeneratorsParamsReturn>(
      IpcChannel.GetValueGeneratorParams,
      ...args
    ),
  setBool: (...args) => ipcInvoke<typeof args, void>(IpcChannel.SetBool, ...args),
  resetBools: (...args) => ipcInvoke<typeof args, void>(IpcChannel.ResetBools, ...args)
}

//
// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

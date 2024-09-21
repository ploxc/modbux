import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Api, ClientState, ConnectionConfig, RegisterConfig, RegisterData } from '@shared'
import { IpcChannel, ipcInvoke } from '@backend'

//
//
// Custom APIs for renderer
const api: Api = {
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

  connect: (...args) => ipcInvoke<typeof args, void>(IpcChannel.Connect, ...args),
  disconnect: (...args) => ipcInvoke<typeof args, void>(IpcChannel.Disconnect, ...args),

  read: (...args) => ipcInvoke<typeof args, RegisterData[] | undefined>(IpcChannel.Read, ...args),
  startPolling: (...args) => ipcInvoke<typeof args, void>(IpcChannel.StartPolling, ...args),
  stopPolling: (...args) => ipcInvoke<typeof args, void>(IpcChannel.StopPolling, ...args),
  write: (...args) => ipcInvoke<typeof args, void>(IpcChannel.Write, ...args),

  scanUnitId: (...args) => ipcInvoke<typeof args, void>(IpcChannel.ScanUnitId, ...args),
  stopScanningUnitId: (...args) =>
    ipcInvoke<typeof args, void>(IpcChannel.StopScanningUnitId, ...args)
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

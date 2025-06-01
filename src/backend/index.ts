import { IpcMainInvokeEvent, ipcMain, ipcRenderer } from 'electron'

export enum IpcChannel {
  GetConnectionConfig = 'GetConnectionConfig',
  UpdateConnectionConfig = 'UpdateConnectionConfig',
  GetRegisterConfig = 'GetRegisterConfig',
  UpdateRegisterConfig = 'UpdateRegisterConfig',
  GetClientState = 'getClientState',
  SetRegisterMapping = 'SetRegisterMapping',
  Connect = 'Connect',
  Disconnect = 'Disconnect',
  Read = 'Read',
  StartPolling = 'StartPolling',
  StopPolling = 'StopPolling',
  Write = 'Write',
  ScanUnitIds = 'ScanUnitIds',
  StopScanningUnitIds = 'StopScanningUnitIds',
  ScanRegisters = 'ScanRegisters',
  StopScanningRegisters = 'StopScanningRegisters',
  AddReplaceServerRegister = 'AddReplaceServerRegister',
  RemoveServerRegister = 'RemoveServerRegister',
  SyncServerRegisters = 'SyncServerRegisters',
  ResetRegisters = 'ResetRegisters',
  SetBool = 'SetBool',
  ResetBools = 'ResetBools',
  SyncBools = 'SyncBools',
  RestartServer = 'RestartServer',
  SetServerPort = 'SetServerPort',
  SetServerUnitId = 'SetServerUnitId',
  GetAppVersion = 'GetAppVersion',
  CreateServer = 'CreateServer',
  DeleteServer = 'DeleteServer'
}

type IpcListener<A extends any[], R> = (event: IpcMainInvokeEvent, ...args: A) => Promise<R> | R

export const ipcHandle = <A extends any[], R>(
  channel: IpcChannel,
  listener: IpcListener<A, R>
): void => {
  ipcMain.handle(channel, listener)
}

export const ipcInvoke = <A extends any[], R>(channel: IpcChannel, ...args: A): Promise<R> => {
  return ipcRenderer.invoke(channel, ...args)
}

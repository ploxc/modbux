import { SharedProps } from 'notistack'
import {
  ClientState,
  ConnectionConfig,
  RegisterConfig,
  RegisterData,
  RegisterMapping,
  WriteParameters
} from './client'
import { ScanUnitIDParameters, ScanRegistersParameters } from './scan'
import {
  RemoveRegisterParams,
  SyncRegisterValueParams,
  NumberRegisters,
  SetBooleanParameters,
  BooleanRegisters,
  SyncBoolsParameters,
  CreateServerParams,
  SetUnitIdParams,
  AddRegisterParams
} from './server'
import { DeepPartial } from './utils'

export interface Api {
  isServerWindow: boolean
  getConnectionConfig: () => Promise<ConnectionConfig>
  updateConnectionConfig: (config: DeepPartial<ConnectionConfig>) => void
  getRegisterConfig: () => Promise<RegisterConfig>
  updateRegisterConfig: (config: DeepPartial<RegisterConfig>) => void
  getClientState: () => Promise<ClientState>
  setRegisterMapping: (mapping: RegisterMapping) => void
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  read: () => Promise<RegisterData[] | undefined>
  startPolling: () => Promise<void>
  stopPolling: () => Promise<void>
  write: (writeParameters: WriteParameters) => Promise<void>
  scanUnitIds: (scanUnitIdParams: ScanUnitIDParameters) => Promise<void>
  stopScanningUnitIds: () => Promise<void>
  scanRegisters: (scanRegistersParams: ScanRegistersParameters) => Promise<void>
  stopScanningRegisters: () => Promise<void>
  addReplaceServerRegister: (params: AddRegisterParams) => void
  removeServerRegister: (params: RemoveRegisterParams) => void
  syncServerregisters: (params: SyncRegisterValueParams) => void
  resetRegisters: (registerType: NumberRegisters) => void
  setBool: (params: SetBooleanParameters) => void
  resetBools: (registerType: BooleanRegisters) => void
  syncBools: (params: SyncBoolsParameters) => void
  restartServer: (uuid: string) => Promise<void>
  setServerPort: (params: CreateServerParams) => Promise<void>
  setServerUnitId: (params: SetUnitIdParams) => Promise<void>
  createServer: (params: CreateServerParams) => Promise<void>
  deleteServer: (uuid: string) => Promise<void>
  getAppVersion: () => Promise<string>
}

export enum IpcEvent {
  BackendMessage = 'backendMessage',
  ClientState = 'clientState',
  RegisterData = 'registerData',
  Transaction = 'transaction',
  ScanUnitIDResult = 'scanUnitIDResult',
  ScanProgress = 'ScanProgress',
  RegisterValue = 'registerValue',
  BooleanValue = 'booleanValue',
  WindowUpdate = 'windowUpdate',
  OpenServerWindow = 'openServerWindow',
  AddressGroups = 'addressGroups'
}

//
//
// Backend Message
export interface BackendMessage {
  message: string
  variant: SharedProps['variant']
  error: unknown | null
}

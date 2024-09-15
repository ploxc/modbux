import { RegisterData, ConnectionConfig, RegisterConfig, Protocol, RegisterType } from '@shared'

export interface RootZusand {
  registerData: RegisterData[]
  connectionConfig: ConnectionConfig
  registerConfig: RegisterConfig
  ready: boolean
  init: () => Promise<void>
  //
  valid: Valid
  setProtocol: (protocol: Protocol) => void
  setPort: MaskSetFn
  setHost: MaskSetFn
  setUnitId: MaskSetFn
  setAddress: MaskSetFn
  setLength: MaskSetFn
  setType: (type: RegisterType) => void
  //
  addressBase: '0' | '1'
  setAddressBase: (value: '0' | '1') => void
}

export type MaskSetFn<V extends string = string> = (value: V, valid?: boolean) => void

interface Valid {
  host: boolean
}

import { RegisterData, ConnectionConfig, RegisterConfig, Protocol } from '@shared'

export interface RootZusand {
  registerData: RegisterData[]
  connectionConfig: ConnectionConfig
  registerConfig: RegisterConfig
  ready: boolean
  init: () => Promise<void>
  setProtocol: (protocol: Protocol) => void
  setPort: MaskSetFn
  setHost: MaskSetFn
  setUnitId: MaskSetFn
  setAddress: MaskSetFn
  setLength: MaskSetFn
  valid: Valid
}

export type MaskSetFn = (value: string, valid?: boolean) => void

interface Valid {
  host: boolean
}

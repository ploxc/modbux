import {
  Protocol,
  RegisterType,
  ModbusBaudRate,
  Parity,
  RegisterMapping,
  RegisterMapValue,
  RegisterMappingSchema,
  ConnectionConfigSchema,
  RegisterConfigSchema,
  SerialPortInfo,
  SerialPortValidationResult,
  ConfigReset,
  DataBits,
  StopBits
} from '@shared'
import z from 'zod'

interface Valid {
  host: boolean
  com: boolean
  length: boolean
}

export const PersistedClientZustandSchema = z.object({
  name: z.string(),
  registerMapping: RegisterMappingSchema,
  connectionConfig: ConnectionConfigSchema,
  registerConfig: RegisterConfigSchema
})
export type PersistedClientZustand = z.infer<typeof PersistedClientZustandSchema>

export type ClientZustand = {
  ready: boolean
  readConfiguration: boolean
  valid: Valid
  setName: (name: string) => void
  // Register mapping
  setRegisterMapping: <K extends keyof RegisterMapValue, V extends RegisterMapValue[K]>(
    register: number,
    key: K,
    value: V
  ) => void
  /** Answers once main has the mapping, because the store writes it after that. */
  replaceRegisterMapping: (registerMapping: RegisterMapping) => Promise<void>
  clearRegisterMapping: () => Promise<void>
  /** What the persisted config lost on the way in, or undefined when it lost nothing. */
  configReset: ConfigReset | undefined
  /** Called once the reset has been reported, so it is reported once. */
  acknowledgeConfigReset: () => void
  // Config
  init: () => void
  // Configuration actions, each one waiting on the boundary before it writes
  setProtocol: (protocol: Protocol) => Promise<void>
  setPort: AsyncMaskSetFn
  setHost: AsyncMaskSetFn
  setUnitId: AsyncMaskSetFn
  setAddress: AsyncMaskSetFn
  setLength: AsyncMaskSetFn
  setType: (type: RegisterType) => Promise<void>
  setCom: AsyncMaskSetFn
  setBaudRate: (baudRate: ModbusBaudRate) => Promise<void>
  setParity: (parity: Parity) => Promise<void>
  setDataBits: (dataBits: DataBits) => Promise<void>
  setStopBits: (stopBits: StopBits) => Promise<void>
  setPollRate: (pollRate: number) => Promise<void>
  setTimeout: (timeout: number) => Promise<void>
  setLittleEndian: (littleEndian: boolean) => Promise<void>

  // Layout configuration settings (i want them to be persistent)
  setAddressBase: (addressBase: '0' | '1') => Promise<void>
  setAdvancedMode: (advancedMode: boolean) => Promise<void>
  setShow64BitValues: (show64BitValues: boolean) => Promise<void>

  // Read configuration
  setReadConfiguration: (readConfiguration: boolean) => void
  // Version

  // Serial port discovery
  serialPorts: SerialPortInfo[]
  serialPortsLoading: boolean
  serialPortValidating: boolean
  refreshSerialPorts: () => Promise<void>
  validateSerialPort: (portPath: string) => Promise<SerialPortValidationResult>
} & PersistedClientZustand

export type ClientSet = (recipe: (state: ClientZustand) => void) => void

export type MaskSetFn<V extends string = string> = (value: V, valid?: boolean) => void

/** A masked setter that waits on the backend before the value settles. */
export type AsyncMaskSetFn<V extends string = string> = (value: V, valid?: boolean) => Promise<void>

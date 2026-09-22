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
  replaceRegisterMapping: (registerMapping: RegisterMapping) => Promise<boolean>
  clearRegisterMapping: () => Promise<boolean>
  /** What the persisted config lost on the way in, or undefined when it lost nothing. */
  configReset: ConfigReset | undefined
  /** Called once the reset has been reported, so it is reported once. */
  acknowledgeConfigReset: () => void
  // Config
  init: () => void
  // Configuration actions, each one waiting on the boundary before it writes.
  // Each answers whether main holds the value afterwards: `false` on every
  // refusal, `true` once it is written or when it was already there.
  setProtocol: (protocol: Protocol) => Promise<boolean>
  setPort: AsyncMaskSetFn
  setHost: AsyncMaskSetFn
  setUnitId: AsyncMaskSetFn
  setAddress: AsyncMaskSetFn
  setLength: AsyncMaskSetFn
  setType: (type: RegisterType) => Promise<boolean>
  setCom: AsyncMaskSetFn
  setBaudRate: (baudRate: ModbusBaudRate) => Promise<boolean>
  setParity: (parity: Parity) => Promise<boolean>
  setDataBits: (dataBits: DataBits) => Promise<boolean>
  setStopBits: (stopBits: StopBits) => Promise<boolean>
  setPollRate: (pollRate: number) => Promise<boolean>
  setTimeout: (timeout: number) => Promise<boolean>
  setLittleEndian: (littleEndian: boolean) => Promise<boolean>

  // Layout configuration settings (i want them to be persistent)
  setAddressBase: (addressBase: '0' | '1') => Promise<boolean>
  setAdvancedMode: (advancedMode: boolean) => Promise<boolean>
  setShow64BitValues: (show64BitValues: boolean) => Promise<boolean>

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
export type AsyncMaskSetFn<V extends string = string> = (
  value: V,
  valid?: boolean
) => Promise<boolean>

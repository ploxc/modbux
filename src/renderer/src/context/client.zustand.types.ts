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

/**
 * Everything one client holds on disk, under the uuid that names it.
 *
 * Taking the key out takes all four, the way `PersistedServerSchema` holds a
 * server.
 */
export const PersistedClientSchema = z.object({
  name: z.string(),
  registerMapping: RegisterMappingSchema,
  connectionConfig: ConnectionConfigSchema,
  registerConfig: RegisterConfigSchema
})
export type PersistedClient = z.infer<typeof PersistedClientSchema>

export const PersistedClientZustandSchema = z.object({
  /** The client the view shows, which every action acts on. */
  selectedUuid: z.string(),
  /** The clients, keyed by the uuid main holds each under. */
  clients: z.record(z.string(), PersistedClientSchema)
})
export type PersistedClientZustand = z.infer<typeof PersistedClientZustandSchema>

/**
 * What a client holds for as long as the window lives and no longer.
 *
 * `ready` says main has the client's config, `readConfiguration` is the
 * session-only switch, and `valid` is what the host, COM and length fields
 * decided about a value, which `init` reads off the value again at load.
 */
export interface ClientSession {
  ready: boolean
  readConfiguration: boolean
  valid: Valid
}

export type ClientZustand = {
  sessions: Record<string, ClientSession>
  /**
   * Adds a client with the default config, hands it to main, and shows it.
   * Answers its uuid.
   */
  addClient: () => string
  /**
   * Takes a client away, in main and here, and shows the first one left. The
   * last client stays: the view always shows one.
   */
  deleteClient: (uuid: string) => Promise<boolean>
  setSelectedUuid: (uuid: string) => void
  setName: (name: string) => void
  // Register mapping
  setRegisterMapping: <K extends keyof RegisterMapValue, V extends RegisterMapValue[K]>(
    register: number,
    key: K,
    value: V
  ) => void
  /**
   * Puts one register's entry back whole, or removes it, under the type named
   * rather than the one on screen. What an undo of a mapping edit replays.
   */
  setMappingEntry: (
    type: RegisterType,
    register: number,
    entry: RegisterMapValue | undefined
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
  // Each answers whether main and the store both hold the value afterwards:
  // `false` on every refusal and on an answer a later call superseded, `true`
  // once it is written or when it was already there.
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
  setOfflineAfterTimeouts: (offlineAfterTimeouts: number) => Promise<boolean>
  setMaxPollInterval: (maxPollInterval: number) => Promise<boolean>
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

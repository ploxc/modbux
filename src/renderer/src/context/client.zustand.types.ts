import {
  AddressGroup,
  ClientUnitSchema,
  Protocol,
  RegisterType,
  LayoutPlace,
  ModbusBaudRate,
  Parity,
  RegisterMapping,
  RegisterMapValue,
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
}

/**
 * Everything one client holds on disk, under the uuid that names it.
 *
 * Taking the key out takes all four, the way `PersistedServerSchema` holds a
 * server. A client has at least one unit: the view always shows one.
 */
export const PersistedClientSchema = z.object({
  name: z.string(),
  connectionConfig: ConnectionConfigSchema,
  registerConfig: RegisterConfigSchema,
  units: z.array(ClientUnitSchema).min(1)
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
 * `ready` says main has the client's config. `selectedUnit` and `shownType`
 * are the unit and register type the view shows, which every unit setter acts
 * on. `readConfiguration` is the session-only switch, per unit's uuid, and
 * `valid` is what the host and COM fields decided about a value, which `init`
 * reads off the value again at load.
 */
export interface ClientSession {
  ready: boolean
  selectedUnit: string
  /** The register type the view acts on, one of those the unit's layout shows. */
  shownType: RegisterType
  readConfiguration: Record<string, boolean>
  /**
   * Where each register type turned off sat, by unit uuid, so turning it on
   * puts it back there. Kept until Modbux closes.
   */
  removedPlaces: Record<string, Partial<Record<RegisterType, LayoutPlace>>>
  valid: Valid
}

export type ClientZustand = {
  sessions: Record<string, ClientSession>
  /**
   * Adds a client, the default config unless one is given, hands it to main,
   * and shows it. Answers its uuid.
   */
  addClient: (client?: PersistedClient) => string
  /**
   * Adds a copy of a client under a new uuid, its units under new uuids too,
   * and shows it. Answers its uuid, or undefined when there is no such client.
   */
  duplicateClient: (uuid: string) => string | undefined
  /**
   * Takes a client away, in main and here, and shows the first one left. The
   * last client stays: the view always shows one.
   */
  deleteClient: (uuid: string) => Promise<boolean>
  setSelectedUuid: (uuid: string) => void
  /** Moves a client to `index` in the sidebar's order. */
  moveClient: (uuid: string, index: number) => void
  setName: (name: string) => void
  // Register mapping
  /**
   * Sets one field of a register's entry under the type named, which is the
   * section the edit was made in and not always the one the view acts on.
   */
  setRegisterMapping: <K extends keyof RegisterMapValue, V extends RegisterMapValue[K]>(
    type: RegisterType,
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
  /**
   * Turns Monitor's Poll on or off for every register in one group of the
   * selected client's unit under `unit`, once main has it. Kept per register,
   * so it outlives the group splitting or moving.
   */
  setGroupPolled: (
    unit: string,
    type: RegisterType,
    group: AddressGroup,
    polled: boolean
  ) => Promise<boolean>
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
  /**
   * The read window of `type` on the unit on screen, or of the type the view
   * acts on when none is named. A field in a section names its own: a masked
   * field reports its value when it mounts, and with two types side by side the
   * second section mounts while the view acts on the first.
   */
  setAddress: (address: string, valid?: boolean, type?: RegisterType) => Promise<boolean>
  setLength: (length: string, valid?: boolean, type?: RegisterType) => Promise<boolean>
  /**
   * Adds a unit to the selected client, hands it to main and shows it. Without
   * a unit id it takes the one after the highest. Answers whether main took it.
   */
  addUnit: (unitId?: number, name?: string) => Promise<boolean>
  /**
   * Adds a copy of a unit of the selected client, mapping and layout included,
   * under the unit id after the highest, and shows it. Answers whether main took it.
   */
  duplicateUnit: (unit: string) => Promise<boolean>
  /**
   * Moves a unit of a client to `index` in its order, and hands main the new
   * order. Answers whether main took it.
   */
  moveUnit: (uuid: string, unit: string, index: number) => Promise<boolean>
  /** Takes a unit of the selected client away, in main and here. The last one stays. */
  removeUnit: (unit: string) => Promise<boolean>
  /** Names the unit on screen. */
  setUnitName: (name: string) => void
  /** Shows another unit of the selected client. Main is not asked. */
  selectUnit: (unit: string) => void
  /**
   * Turns a register type of the selected unit on or off. A type turned on is
   * added to the unit's layout and acted on; the last one on stays.
   */
  setType: (type: RegisterType) => void
  /** Turns a type on when it is off, and acts on it: what an undo and the assistant ask. */
  showType: (type: RegisterType) => void
  /** Acts on a type the layout shows, as a click into its section does. */
  focusType: (type: RegisterType) => void
  /** The selected unit's layout, as `formatLayout` writes it: a drag or a resize. */
  setLayout: (layout: string) => void
  /** Whether a poll reads `type` of the selected unit. */
  /** Whether a poll reads `type` of the selected unit, or of the unit under `unit`. */
  setPolled: (type: RegisterType, polled: boolean, unit?: string) => Promise<boolean>
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

  // Read configuration, of the selected unit
  setReadConfiguration: (readConfiguration: boolean) => void
  /**
   * Turns read configuration on for the units of the client under `uuid`
   * that have it off, or for those of `units` that do. Logging asks it when it
   * starts, and for a unit added while it is on: Monitor polls while the log
   * is on, and Debug shows Monitor's reads over the mapping.
   */
  readConfigurationForLog: (uuid: string, units?: string[]) => void
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

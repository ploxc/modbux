import {
  RemoveRegisterParams,
  BooleanRegisters,
  NumberRegisters,
  CreateServerParams,
  ServerRegisters,
  NumberRegistersSchema,
  AddRegisterParams,
  UnitIdStringSchema,
  UnitIdString,
  ServerRegistersPerUnitSchema,
  ServerModeSchema,
  ServerSerialConfigSchema,
  SerialPortInfo,
  ModbusBaudRate,
  Parity,
  ConfigReset,
  DataBits,
  StopBits,
  ServerRegisterValue
} from '@shared'
import { AsyncMaskSetFn, MaskSetFn } from './client.zustand.types'
import { z } from 'zod'

export const UsedAddressesSchema = z.record(NumberRegistersSchema, z.array(z.number()))
export type UsedAddresses = z.infer<typeof UsedAddressesSchema>

export const PersistedServerZustandSchema = z.object({
  selectedUuid: z.string(),
  uuids: z.array(z.string()),
  serverRegisters: z.record(z.string(), z.union([ServerRegistersPerUnitSchema, z.undefined()])),
  usedAddresses: z.record(
    z.string(),
    z.union([z.record(UnitIdStringSchema, UsedAddressesSchema), z.undefined()])
  ),
  port: z.record(z.string(), z.string()),
  unitId: z.record(z.string(), z.union([UnitIdStringSchema, z.undefined()])),
  name: z.record(z.string(), z.string().optional()),
  littleEndian: z.record(z.string(), z.boolean()),
  serverMode: ServerModeSchema.optional(),
  serialConfig: ServerSerialConfigSchema.optional()
})

export type PersistedServerZustand = z.infer<typeof PersistedServerZustandSchema>

export interface SetBoolParameters {
  registerType: BooleanRegisters
  address: number
  boolState: boolean
  optionalUuid?: string
  optionalUnitId?: UnitIdString
}

export interface SetRegisterValueParameters {
  registerType: NumberRegisters
  address: number
  value: ServerRegisterValue
  optionalUuid?: string
  optionalUnitId?: UnitIdString
}

export type ServerZustand = {
  /** What the persisted config lost on the way in, or undefined when it lost nothing. */
  configReset: ConfigReset | undefined
  /** Called once the reset has been reported, so it is reported once. */
  acknowledgeConfigReset: () => void
  /**
   * Whether main knows this uuid, which is what `setPort`, `setUnitId` and
   * `setLittleEndian` refuse on: a port main has not bound is a port nothing
   * can be changed about.
   *
   * Written by `syncUuidToBackend`, by `createServer`, and by the
   * `window_update` rehydrate for a uuid the split out window made and synced
   * itself. `init` sets every uuid false before its loop, so a sync that fails
   * leaves that one uuid refusing its three setters and no other.
   */
  ready: { [uuid: string]: boolean }
  /**
   * Whether `init` has run to its end, whatever it managed.
   *
   * `containers/Server.tsx` fades the whole server view in on this. It used to
   * read `ready`, which is per uuid and written only on a sync that got
   * through, so a rejected invoke anywhere in `init`'s loop left the view blank
   * on that launch and on every one after it, with nothing on screen to clear
   * the config with. The two questions are separate: this one is about the
   * store, `ready` is about a server.
   */
  initialized: boolean
  clean: (uuid: string) => void
  /**
   * Remove all state entries for uuids that are not present in the uuids array.
   * This prevents memory leaks and UI bugs from stale state.
   */
  cleanOrphanedServerState: () => void
  setSelectedUuid: (uuid: string) => void
  createServer: (params: CreateServerParams) => Promise<void>
  deleteServer: (uuid: string) => Promise<void>
  /** Empties a uuid on both sides: main's data and generators, then `clean`. */
  resetServer: (uuid: string) => Promise<void>
  init: (uuid?: string) => Promise<void>
  addBool: (type: BooleanRegisters, address: number) => void
  removeBool: (type: BooleanRegisters, address: number) => void
  setBool: (params: SetBoolParameters | Array<SetBoolParameters>) => void
  setBoolComment: (type: BooleanRegisters, address: number, comment: string | undefined) => void
  resetBools: (type: BooleanRegisters) => void
  addRegister: (params: AddRegisterParams) => Promise<boolean>
  removeRegister: (params: RemoveRegisterParams) => void
  setRegisterValue: (params: SetRegisterValueParameters | Array<SetRegisterValueParameters>) => void
  resetRegisters: (type: NumberRegisters) => void
  // Asks the backend and settles on the port it actually got, so callers
  // that need the result -- the privileged port modal -- can await it.
  setPort: AsyncMaskSetFn
  setUnitId: MaskSetFn<UnitIdString>
  setLittleEndian: (value: boolean) => Promise<void>
  // Replace
  replaceServerRegisters: (unitId: UnitIdString, registers: ServerRegisters) => void
  setName: (name: string) => void
  getUnitId: (uuid: string) => UnitIdString
  // RTU server mode
  switchToRtu: () => Promise<void>
  switchToTcp: () => Promise<void>
  setServerCom: (com: string) => void
  applyServerCom: () => Promise<void>
  setServerBaudRate: (baudRate: ModbusBaudRate) => void
  setServerParity: (parity: Parity) => void
  setServerDataBits: (dataBits: DataBits) => void
  setServerStopBits: (stopBits: StopBits) => void
  serialPorts: SerialPortInfo[]
  serialPortsLoading: boolean
  refreshSerialPorts: () => Promise<void>
  rtuServerActive: boolean
} & PersistedServerZustand

/** The recipe half of the store's `set`, for a helper that writes through it. */
export type ServerSet = (recipe: (state: ServerZustand) => void) => void

export type DefinedServerRegisters = Exclude<
  PersistedServerZustand['serverRegisters'][UnitIdString],
  undefined
>

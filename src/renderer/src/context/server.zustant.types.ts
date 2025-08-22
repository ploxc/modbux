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
  ServerRegistersPerUnitSchema
} from '@shared'
import { MaskSetFn } from './root.zustand.types'
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
  portValid: z.record(z.string(), z.boolean())
})

export type PersistedServerZustand = z.infer<typeof PersistedServerZustandSchema>

export type ServerZustand = {
  ready: { [uuid: string]: boolean }
  clean: (uuid: string) => void
  /**
   * Remove all state entries for uuids that are not present in the uuids array.
   * This prevents memory leaks and UI bugs from stale state.
   */
  cleanOrphanedServerState: () => void
  setSelectedUuid: (uuid: string) => void
  createServer: (params: CreateServerParams) => Promise<void>
  deleteServer: (uuid: string) => Promise<void>
  init: (uuid?: string) => Promise<void>
  addBools: (type: BooleanRegisters, address: number) => void
  removeBool: (type: BooleanRegisters, address: number) => void
  setBool: (
    type: BooleanRegisters,
    address: number,
    value: boolean,
    uuid?: string,
    unitId?: UnitIdString
  ) => void
  resetBools: (type: BooleanRegisters) => void
  addRegister: (params: AddRegisterParams) => void
  removeRegister: (params: RemoveRegisterParams) => void
  setRegisterValue: (
    type: NumberRegisters,
    address: number,
    value: number,
    uuid?: string,
    unitId?: UnitIdString
  ) => void
  resetRegisters: (type: NumberRegisters) => void
  setPort: MaskSetFn
  setUnitId: MaskSetFn<UnitIdString>
  // Replace
  replaceServerRegisters: (unitId: UnitIdString, registers: ServerRegisters) => void
  setName: (name: string) => void
  getUnitId: (uuid: string) => UnitIdString
} & PersistedServerZustand

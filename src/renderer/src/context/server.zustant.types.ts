import {
  RegisterType,
  RemoveRegisterValueParams,
  RegisterValueParameters,
  BooleanRegisters,
  NumberRegisters
} from '@shared'
import { MaskSetFn } from './root.zustand.types'

type ServerBool = { [key: number]: boolean }
export type ServerRegister = { [key: number]: ServerRegisterEntry }
export type ServerRegisterEntry = { value: number; params: RegisterValueParameters }

export interface ServerRegisters {
  [RegisterType.Coils]: ServerBool
  [RegisterType.DiscreteInputs]: ServerBool
  [RegisterType.InputRegisters]: ServerRegister
  [RegisterType.HoldingRegisters]: ServerRegister
}

interface UsedAddresses {
  [RegisterType.InputRegisters]: number[]
  [RegisterType.HoldingRegisters]: number[]
}

export interface ServerZustand {
  ready: boolean
  serverRegisters: ServerRegisters
  init: () => Promise<void>
  addBools: (type: BooleanRegisters, address: number) => void
  removeBool: (type: BooleanRegisters, address: number) => void
  setBool: (type: BooleanRegisters, address: number, value: boolean) => void
  resetBools: (type: BooleanRegisters) => void
  addRegister: (params: RegisterValueParameters) => void
  removeRegister: (params: RemoveRegisterValueParams) => void
  setRegisterValue: (type: NumberRegisters, address: number, value: number) => void
  resetRegisters: (type: NumberRegisters) => void
  usedAddresses: UsedAddresses
  // Settings
  port: string
  portValid: boolean
  setPort: MaskSetFn
  unitId: string
  setUnitId: MaskSetFn
  // Replace
  replaceServerRegisters: (params: ServerRegisters) => void
}

import { RegisterType, RemoveValueGeneratorParams, ValueGeneratorParameters } from '@shared'

type ServerBool = { [key: number]: boolean }
type ServerRegister = { [key: number]: { value: number; params: ValueGeneratorParameters } }

interface ServerRegisters {
  [RegisterType.Coils]: ServerBool
  [RegisterType.DiscreteInputs]: ServerBool
  [RegisterType.InputRegisters]: ServerRegister
  [RegisterType.HoldingRegisters]: ServerRegister
}

export interface ServerZustand {
  ready: boolean
  serverRegisters: ServerRegisters
  init: () => Promise<void>
  addBool: (type: RegisterType.Coils | RegisterType.DiscreteInputs, address: number) => void
  removeBool: (type: RegisterType.Coils | RegisterType.DiscreteInputs, address: number) => void
  setBool: (
    type: RegisterType.Coils | RegisterType.DiscreteInputs,
    address: number,
    value: boolean
  ) => void
  addRegister: (params: ValueGeneratorParameters) => void
  removeRegister: (params: RemoveValueGeneratorParams) => void
  setRegisterValue: (
    type: RegisterType.InputRegisters | RegisterType.HoldingRegisters,
    address: number,
    value: number
  ) => void
}

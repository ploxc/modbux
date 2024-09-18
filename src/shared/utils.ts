import { RegisterType } from './types'

export const getConventionalAddress = (
  type: RegisterType,
  address: string,
  addressBase: string
) => {
  return type === RegisterType.DiscreteInputs
    ? Number(address) + 10000 + Number(addressBase)
    : type === RegisterType.HoldingRegisters
      ? Number(address) + 40000 + Number(addressBase)
      : type === RegisterType.InputRegisters
        ? Number(address) + 30000 + Number(addressBase)
        : Number(address) + Number(addressBase)
}

export const getBit = (word: number, bit: number) => (word & (2 ** bit)) === 2 ** bit

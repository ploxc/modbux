import { AddressGroup, RegisterData } from '@shared'

export interface DataZustand {
  // Register data
  registerData: RegisterData[]
  setRegisterData: (data: RegisterData[]) => void
  appendRegisterData: (data: RegisterData[]) => void
  addressGroups: AddressGroup[]
  setAddressGroups: (groups: AddressGroup[]) => void
}

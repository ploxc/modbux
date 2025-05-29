import { RegisterData } from '@shared'

export interface DataZustand {
  // Register data
  registerData: RegisterData[]
  setRegisterData: (data: RegisterData[]) => void
  appendRegisterData: (data: RegisterData[]) => void
  addressGroups: [number, number][]
  setAddressGroups: (groups: [number, number][]) => void
}

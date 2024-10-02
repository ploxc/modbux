import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { useServerZustand } from '@renderer/context/server.zustand'
import { ServerRegister } from '@renderer/context/server.zustant.types'
import { DataType, NumberRegisters } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

export const getAddressInUse = (
  registerType: NumberRegisters,
  dataType: DataType,
  address: number
) => {
  // Validate so address is not already used when not in edit mode
  const edit = useAddRegisterZustand.getState().serverRegisterEdit !== undefined
  if (edit) return false

  const usedAddresses = registerType ? useServerZustand.getState().usedAddresses[registerType] : []

  const addressesNeeded = [DataType.Double, DataType.UInt64, DataType.Int64].includes(dataType)
    ? [address, address + 1, address + 2, address + 3]
    : [DataType.UInt32, DataType.Int32, DataType.Float].includes(dataType)
      ? [address, address + 1]
      : [address]

  return addressesNeeded.some((a) => usedAddresses.includes(Number(a)))
}

interface AddRegisterZustand {
  serverRegisterEdit: ServerRegister[number] | undefined
  registerType: NumberRegisters | undefined
  setRegisterType: (
    registerType: NumberRegisters | undefined,
    serverRegister?: ServerRegister[number]
  ) => void
  valid: {
    address: boolean
    value: boolean
    min: boolean
    max: boolean
    interval: boolean
  }
  address: string
  addressInUse: boolean
  setAddress: MaskSetFn
  dataType: DataType
  setDataType: (dataType: DataType) => void
  value: string
  setValue: MaskSetFn
  interval: string
  setInterval: MaskSetFn
  littleEndian: boolean
  setLittleEndian: (littleEndian: boolean) => void
  comment: string
  setComment: MaskSetFn
  min: string
  setMin: MaskSetFn
  max: string
  setMax: MaskSetFn
  fixed: boolean
  setFixed: (fixed: boolean) => void
  initFirstUnusedAddress: () => void
}

export const useAddRegisterZustand = create<AddRegisterZustand, [['zustand/mutative', never]]>(
  mutative((set, getState) => ({
    serverRegisterEdit: undefined,
    registerType: undefined,
    setRegisterType: (registerType, serverRegister) =>
      set((state) => {
        state.registerType = registerType
        state.serverRegisterEdit = registerType ? serverRegister : undefined
      }),
    valid: {
      address: true,
      value: true,
      min: true,
      max: true,
      interval: true
    },
    address: '0',
    addressInUse: false,
    setAddress: (address, valid) =>
      set((state) => {
        state.address = address

        const { registerType, dataType } = getState()
        if (!registerType) return

        const addressInUse = getAddressInUse(registerType, dataType, Number(address))

        state.addressInUse = addressInUse
        state.valid.address = !!valid && !addressInUse
      }),
    dataType: DataType.Int16,
    setDataType: (dataType) =>
      set((state) => {
        state.dataType = dataType
        const { registerType, address } = getState()
        if (!registerType) return
        const addressInUse = getAddressInUse(registerType, dataType, Number(address))

        state.addressInUse = addressInUse
        state.valid.address = String(address).length > 0 && !addressInUse
      }),
    value: '0',
    valueValid: true,
    setValue: (value, valid) =>
      set((state) => {
        state.value = value
        state.valid.value = !!valid
      }),
    interval: '1',
    setInterval: (interval, valid) =>
      set((state) => {
        state.interval = interval
        state.valid.interval = !!valid
      }),
    littleEndian: false,
    setLittleEndian: (littleEndian) =>
      set((state) => {
        state.littleEndian = littleEndian
      }),
    comment: '',
    setComment: (comment) =>
      set((state) => {
        state.comment = comment
      }),
    min: '0',
    setMin: (min, valid) =>
      set((state) => {
        state.min = min
        state.valid.min = !!valid
      }),
    max: '1',
    setMax: (max, valid) =>
      set((state) => {
        state.max = max
        state.valid.max = !!valid
      }),
    fixed: true,
    setFixed: (fixed) =>
      set((state) => {
        state.fixed = fixed
      }),
    initFirstUnusedAddress: () =>
      set((state) => {
        const { registerType } = getState()
        if (!registerType) return
        const usedAddresses = useServerZustand.getState().usedAddresses[registerType]
        for (let address = 0; address <= 65535; address++) {
          if (!usedAddresses.includes(address)) {
            state.address = String(address)
            break
          }
        }
      })
  }))
)

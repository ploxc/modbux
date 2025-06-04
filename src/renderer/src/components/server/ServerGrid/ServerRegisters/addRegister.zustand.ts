/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { useServerZustand } from '@renderer/context/server.zustand'
import { BaseDataType, DataType, NumberRegisters, ServerRegister, UnitIdString } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

type GetAddressInUseFn = (
  uuid: string,
  unitId: UnitIdString,
  registerType: NumberRegisters,
  dataType: DataType,
  address: number
) => boolean

export const getAddressInUse: GetAddressInUseFn = (
  uuid,
  unitId,
  registerType,
  dataType,
  address
) => {
  // In edit mode, ignore the register being edited for overlap check
  const editRegister = useAddRegisterZustand.getState().serverRegisterEdit
  const usedAddresses = registerType
    ? (useServerZustand.getState().usedAddresses[uuid]?.[unitId]?.[registerType] ?? [])
    : []
  const addressesNeeded = ['double', 'uint64', 'int64'].includes(dataType)
    ? [address, address + 1, address + 2, address + 3]
    : ['uint32', 'int32', 'float'].includes(dataType)
      ? [address, address + 1]
      : [address]
  if (editRegister) {
    // Remove the addresses of the register being edited from usedAddresses
    const editAddresses = ['double', 'uint64', 'int64'].includes(editRegister.params.dataType)
      ? [
          editRegister.params.address,
          editRegister.params.address + 1,
          editRegister.params.address + 2,
          editRegister.params.address + 3
        ]
      : ['uint32', 'int32', 'float'].includes(editRegister.params.dataType)
        ? [editRegister.params.address, editRegister.params.address + 1]
        : [editRegister.params.address]
    const filteredUsed = usedAddresses.filter((a) => !editAddresses.includes(a))
    return addressesNeeded.some((a) => filteredUsed.includes(Number(a)))
  }
  return addressesNeeded.some((a) => usedAddresses.includes(Number(a)))
}

function getAddressFitError(dataType: BaseDataType, address: number): boolean {
  // Check if the datatype fits at the address (address + size - 1 <= 65535)
  let size = 1
  if (['int32', 'uint32', 'float'].includes(dataType)) size = 2
  if (['int64', 'uint64', 'double'].includes(dataType)) size = 4
  return address + size - 1 > 65535
}

interface AddRegisterZustand {
  serverRegisterEdit: ServerRegister[number] | undefined
  registerType: NumberRegisters | undefined
  setRegisterType: (registerType: NumberRegisters | undefined) => void
  setEditRegister: (register: ServerRegister[number] | undefined) => void
  valid: {
    address: boolean
    value: boolean
    min: boolean
    max: boolean
    interval: boolean
  }
  address: string
  addressInUse: boolean
  addressFitError: boolean
  setAddress: MaskSetFn
  dataType: BaseDataType
  setDataType: (dataType: BaseDataType) => void
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
    setRegisterType: (registerType) =>
      set((state) => {
        state.registerType = registerType
      }),

    setEditRegister: (register) =>
      set((state) => {
        state.serverRegisterEdit = register
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
    addressFitError: false,
    setAddress: (address, valid) =>
      set((state) => {
        state.address = address
        const { registerType, dataType } = getState()
        if (!registerType) return
        const z = useServerZustand.getState()
        const uuid = z.selectedUuid
        const unitId = z.getUnitId(uuid)
        const addressNum = Number(address)
        const addressInUse = getAddressInUse(uuid, unitId, registerType, dataType, addressNum)
        const addressFitError = getAddressFitError(dataType, addressNum)
        state.addressInUse = addressInUse
        state.addressFitError = addressFitError
        state.valid.address = !!valid && !addressInUse && !addressFitError
      }),
    dataType: 'int16',
    setDataType: (dataType) =>
      set((state) => {
        state.dataType = dataType
        const { registerType, address } = getState()
        if (!registerType) return
        const z = useServerZustand.getState()
        const uuid = z.selectedUuid
        const unitId = z.getUnitId(uuid)
        const addressNum = Number(address)
        const addressInUse = getAddressInUse(uuid, unitId, registerType, dataType, addressNum)
        const addressFitError = getAddressFitError(dataType, addressNum)
        state.addressInUse = addressInUse
        state.addressFitError = addressFitError
        state.valid.address = String(address).length > 0 && !addressInUse && !addressFitError
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

        const z = useServerZustand.getState()
        const uuid = z.selectedUuid
        const unitId = z.getUnitId(uuid)

        const usedAddresses = z.usedAddresses[uuid]?.[unitId]?.[registerType] ?? []
        for (let address = 0; address <= 65535; address++) {
          if (!usedAddresses.includes(address)) {
            state.address = String(address)
            break
          }
        }
      })
  }))
)

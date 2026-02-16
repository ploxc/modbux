/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { useServerZustand } from '@renderer/context/server.zustand'
import {
  BaseDataType,
  DataType,
  getAddressFitError,
  NumberRegisters,
  ServerRegister,
  UnitIdString
} from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

const getRegisterSize = (dataType: DataType, length?: number): number => {
  if (['double', 'uint64', 'int64', 'datetime'].includes(dataType)) return 4
  if (['uint32', 'int32', 'float', 'unix'].includes(dataType)) return 2
  if (dataType === 'utf8') return length ?? 10
  return 1
}

type GetAddressInUseFn = (
  uuid: string,
  unitId: UnitIdString,
  registerType: NumberRegisters,
  dataType: DataType,
  address: number,
  length?: number
) => boolean

export const getAddressInUse: GetAddressInUseFn = (
  uuid,
  unitId,
  registerType,
  dataType,
  address,
  length
) => {
  const editRegister = useAddRegisterZustand.getState().serverRegisterEdit
  const usedAddresses = registerType
    ? (useServerZustand.getState().usedAddresses[uuid]?.[unitId]?.[registerType] ?? [])
    : []

  const size = getRegisterSize(dataType, length)
  const addressesNeeded = Array.from({ length: size }, (_, i) => address + i)

  if (editRegister) {
    const editSize = getRegisterSize(editRegister.params.dataType, editRegister.params.length)
    const editAddresses = Array.from(
      { length: editSize },
      (_, i) => editRegister.params.address + i
    )
    const filteredUsed = usedAddresses.filter((a) => !editAddresses.includes(a))
    return addressesNeeded.some((a) => filteredUsed.includes(Number(a)))
  }
  return addressesNeeded.some((a) => usedAddresses.includes(Number(a)))
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
  comment: string
  setComment: MaskSetFn
  min: string
  setMin: MaskSetFn
  max: string
  setMax: MaskSetFn
  fixed: boolean
  setFixed: (fixed: boolean) => void
  stringValue: string
  setStringValue: (value: string) => void
  registerLength: string
  setRegisterLength: MaskSetFn
  showDatePickerUtc: boolean
  setShowDatePickerUtc: (utc: boolean) => void
  initNextUnusedAddress: (startFrom?: number) => void
  resetToDefaults: () => void
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
        const { registerType, dataType, registerLength } = getState()
        if (!registerType) return
        const z = useServerZustand.getState()
        const uuid = z.selectedUuid
        const unitId = z.getUnitId(uuid)
        const addressNum = Number(address)
        const length = dataType === 'utf8' ? Number(registerLength) || 10 : undefined
        const addressInUse = getAddressInUse(
          uuid,
          unitId,
          registerType,
          dataType,
          addressNum,
          length
        )
        const addressFitError = getAddressFitError(dataType, addressNum, length)
        state.addressInUse = addressInUse
        state.addressFitError = addressFitError
        state.valid.address = !!valid && !addressInUse && !addressFitError
      }),
    dataType: 'int16',
    setDataType: (dataType) =>
      set((state) => {
        state.dataType = dataType
        // Force fixed mode for utf8
        if (dataType === 'utf8') {
          state.fixed = true
        }
        // Initialize value to current timestamp for unix/datetime
        if (['unix', 'datetime'].includes(dataType)) {
          state.value = String(Date.now())
          state.valid.value = true
        }
        const { registerType, address, registerLength } = getState()
        if (!registerType) return
        const z = useServerZustand.getState()
        const uuid = z.selectedUuid
        const unitId = z.getUnitId(uuid)
        const addressNum = Number(address)
        const length = dataType === 'utf8' ? Number(registerLength) || 10 : undefined
        const addressInUse = getAddressInUse(
          uuid,
          unitId,
          registerType,
          dataType,
          addressNum,
          length
        )
        const addressFitError = getAddressFitError(dataType, addressNum, length)
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
    stringValue: '',
    setStringValue: (value) =>
      set((state) => {
        state.stringValue = value
      }),
    registerLength: '10',
    setRegisterLength: (registerLength, valid) =>
      set((state) => {
        state.registerLength = registerLength
        // Revalidate address when length changes (for utf8)
        const { registerType, dataType, address } = getState()
        if (!registerType || dataType !== 'utf8') return
        const z = useServerZustand.getState()
        const uuid = z.selectedUuid
        const unitId = z.getUnitId(uuid)
        const addressNum = Number(address)
        const length = Number(registerLength) || 10
        const addressInUse = getAddressInUse(
          uuid,
          unitId,
          registerType,
          dataType,
          addressNum,
          length
        )
        const addressFitError = getAddressFitError(dataType, addressNum, length)
        state.addressInUse = addressInUse
        state.addressFitError = addressFitError
        state.valid.address =
          String(address).length > 0 && !!valid && !addressInUse && !addressFitError
      }),
    showDatePickerUtc: false,
    setShowDatePickerUtc: (utc) =>
      set((state) => {
        state.showDatePickerUtc = utc
      }),
    initNextUnusedAddress: (startFrom?: number) =>
      set((state) => {
        const { registerType, dataType, registerLength } = getState()
        if (!registerType) return

        const z = useServerZustand.getState()
        const uuid = z.selectedUuid
        const unitId = z.getUnitId(uuid)

        const usedAddresses = z.usedAddresses[uuid]?.[unitId]?.[registerType] ?? []
        const start = startFrom ?? 0
        const size = getRegisterSize(
          dataType,
          dataType === 'utf8' ? Number(registerLength) || 10 : undefined
        )
        for (let addr = start; addr <= 65535 - (size - 1); addr++) {
          const needed = Array.from({ length: size }, (_, i) => addr + i)
          if (needed.every((a) => !usedAddresses.includes(a))) {
            state.address = String(addr)
            state.addressInUse = false
            state.addressFitError = false
            state.valid.address = true
            break
          }
        }
      }),
    resetToDefaults: () =>
      set((state) => {
        state.address = '0'
        state.dataType = 'int16'
        state.value = '0'
        state.min = '0'
        state.max = '1'
        state.interval = '1'
        state.comment = ''
        state.fixed = true
        state.stringValue = ''
        state.registerLength = '10'
        state.serverRegisterEdit = undefined
        state.addressInUse = false
        state.addressFitError = false
        state.valid = { address: true, value: true, min: true, max: true, interval: true }
      })
  }))
)

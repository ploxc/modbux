import type {
  BaseDataType,
  DataType,
  NumberRegisters,
  RegisterParams,
  RegisterParamsBasePart
} from '@shared'

/**
 * Returns the number of Modbus registers a data type occupies.
 */
export const getRegisterSize = (dataType: DataType, length?: number): number => {
  if (['double', 'uint64', 'int64', 'datetime'].includes(dataType)) return 4
  if (['uint32', 'int32', 'float', 'unix'].includes(dataType)) return 2
  if (dataType === 'utf8') return length ?? 10
  return 1
}

/**
 * Pure function that checks whether an address (+ its data-type span) overlaps
 * with already-used addresses, optionally excluding the addresses of the
 * register currently being edited.
 */
export const isAddressInUse = (
  usedAddresses: number[],
  dataType: DataType,
  address: number,
  length?: number,
  editRegister?: { dataType: DataType; address: number; length?: number }
): boolean => {
  const size = getRegisterSize(dataType, length)
  const addressesNeeded = Array.from({ length: size }, (_, i) => address + i)

  if (editRegister) {
    const editSize = getRegisterSize(editRegister.dataType, editRegister.length)
    const editAddresses = Array.from({ length: editSize }, (_, i) => editRegister.address + i)
    const filteredUsed = usedAddresses.filter((a) => !editAddresses.includes(a))
    return addressesNeeded.some((a) => filteredUsed.includes(Number(a)))
  }

  return addressesNeeded.some((a) => usedAddresses.includes(Number(a)))
}

/** What the add-register dialog holds, before any of it means anything. */
export interface RegisterFormValues {
  fixed: boolean
  address: string
  value: string
  dataType: BaseDataType
  registerType: NumberRegisters
  min: string
  max: string
  interval: string
  comment: string
  stringValue: string
  registerLength: string
}

/**
 * Turns what the dialog holds into the params the server stores.
 *
 * Everything in the dialog is a string, and the conversions out of it are not
 * uniform. An interval is typed in seconds and stored in milliseconds. A unix
 * timestamp is stored in seconds while a datetime, picked in the same field,
 * is stored in milliseconds. A utf8 register falls back to ten registers when
 * no length was given. A generated timestamp reads the system clock, so its
 * min and max carry nothing and are pinned to zero.
 */
export const toRegisterParams = (form: RegisterFormValues): RegisterParams => {
  const base: RegisterParamsBasePart = {
    address: Number(form.address),
    dataType: form.dataType,
    comment: form.comment,
    registerType: form.registerType
  }

  if (form.dataType === 'utf8') {
    return {
      ...base,
      value: 0,
      stringValue: form.stringValue,
      length: Number(form.registerLength) || 10
    }
  }

  if (['unix', 'datetime'].includes(form.dataType)) {
    if (form.fixed) {
      const picked = Number(form.value)
      return { ...base, value: form.dataType === 'unix' ? Math.floor(picked / 1000) : picked }
    }
    return { ...base, min: 0, max: 0, interval: Number(form.interval) * 1000 }
  }

  if (form.fixed) return { ...base, value: Number(form.value) }

  return {
    ...base,
    min: Number(form.min),
    max: Number(form.max),
    interval: Number(form.interval) * 1000
  }
}

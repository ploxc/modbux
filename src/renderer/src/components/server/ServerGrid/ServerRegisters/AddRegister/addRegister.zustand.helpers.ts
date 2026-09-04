import {
  BaseDataType,
  DataType,
  NumberRegisters,
  RegisterParams,
  RegisterParamsBasePart,
  registerWidth
} from '@shared'

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
  const size = registerWidth(dataType, length)
  const addressesNeeded = Array.from({ length: size }, (_, i) => address + i)

  if (editRegister) {
    const editSize = registerWidth(editRegister.dataType, editRegister.length)
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
 * What a field shows when the register has nothing for it.
 *
 * The dialog offers both a fixed value and a generator's range, and a register
 * carries one set or the other. Switching to the set it does not carry has to
 * land on something a user can submit.
 */
export const FIELD_DEFAULTS = {
  value: '0',
  min: '0',
  max: '1',
  interval: '1'
}

/**
 * The fields a user can change while the dialog is open. `registerType` is not
 * one of them: it comes from the button that opened the dialog, and no control
 * inside changes it.
 */
export type RegisterFormSnapshot = Omit<RegisterFormValues, 'registerType'>

/** What the dialog holds now, kept so a later state can be compared to it. */
export const toFormSnapshot = (form: RegisterFormSnapshot): RegisterFormSnapshot => ({
  fixed: form.fixed,
  address: form.address,
  value: form.value,
  dataType: form.dataType,
  min: form.min,
  max: form.max,
  interval: form.interval,
  comment: form.comment,
  stringValue: form.stringValue,
  registerLength: form.registerLength
})

/**
 * Whether anything has been typed since the dialog opened.
 *
 * The comparison is against what the edit effect wrote into the fields, not
 * against the register itself, because that effect converts on the way in: an
 * interval is divided by a thousand, a unix value is multiplied by it, and a
 * utf8 length that was never set becomes ten. Compared against the register, a
 * conversion that does not round-trip would make the dialog dirty the moment it
 * opened.
 */
export const isFormDirty = (
  form: RegisterFormSnapshot,
  pristine: RegisterFormSnapshot | undefined
): boolean => {
  if (!pristine) return false
  const fields = Object.keys(pristine) as (keyof RegisterFormSnapshot)[]
  return fields.some((field) => form[field] !== pristine[field])
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

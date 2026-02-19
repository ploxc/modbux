import type { DataType } from '@shared'

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

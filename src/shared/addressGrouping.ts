import type { AddressGroup, DataType, RegisterMapObject, RegisterMapValue } from './types'

/**
 * Determine how many Modbus registers to read for a given DataType.
 * For Utf8, if `nextAddress` is provided we read up to that gap;
 * otherwise we fall back to a safe default of 24 registers.
 */
export const getRegisterLength = (
  dataType: DataType,
  currentAddress: number,
  nextAddress?: number
): number => {
  const DEFAULT_UTF8_REGISTERS = 24

  switch (dataType) {
    case 'none':
      return 0

    case 'int16':
    case 'uint16':
      return 1

    case 'float':
    case 'int32':
    case 'uint32':
    case 'datetime':
    case 'unix':
      return 2

    case 'int64':
    case 'uint64':
    case 'double':
      return 4

    case 'utf8':
      if (typeof nextAddress === 'number' && nextAddress > currentAddress) {
        // only use the real gap if it's no larger than DEFAULT_UTF8_REGISTERS
        const gap = nextAddress - currentAddress
        return Math.min(gap, DEFAULT_UTF8_REGISTERS)
      }
      // fallback for when we don't know the next address or it's not helpful
      return DEFAULT_UTF8_REGISTERS
  }
}

/**
 * Build AddrInfo entries including correct registerCount.
 */
export const buildAddrInfos = (
  items: [string, RegisterMapValue][]
): Array<{ address: number; registerCount: number; groupEnd: boolean }> => {
  return items
    .map((item, idx, arr) => {
      const dataType = item[1].dataType
      if (!dataType || dataType === 'none') return undefined

      const address = Number(item[0])

      const next = arr[idx + 1]
      const nextAddress = next?.[0] ? Number(next[0]) : undefined
      const registerCount = getRegisterLength(dataType, address, nextAddress)

      return {
        address,
        registerCount,
        groupEnd: !!item[1].groupEnd
      }
    })
    .filter((i) => i !== undefined)
}

/**
 * Group a list of AddrInfo items into minimal continuous Modbus read blocks.
 *
 * @param registers  - register map object for the current type
 * @param maxLength  - maximum registers per read (default 100)
 * @returns          - array of [startAddress, count]
 */
export const groupAddressInfos = (
  registers: RegisterMapObject | undefined,
  maxLength: number = 100
): Array<AddressGroup> => {
  if (!registers) return []

  const isRegisterEntry = (
    tup: [string, RegisterMapValue | undefined]
  ): tup is [string, RegisterMapValue] => {
    return tup[1] !== undefined
  }

  const registerEntries = Object.entries(registers)
    .filter(isRegisterEntry)
    .filter((entry) => entry[1].dataType !== undefined && entry[1].dataType !== 'none')

  const infos = buildAddrInfos(registerEntries)

  // 1) Make a shallow copy and sort by address ascending
  const sorted = infos.slice().sort((a, b) => a.address - b.address)

  const groups: Array<AddressGroup> = []
  let i = 0 // index of the first ungrouped item

  // 2) Continue until we have grouped all items
  while (i < sorted.length) {
    // This block starts at the current item's address
    const startAddr = sorted[i].address
    // Initial endAddr is the last register used by this item
    let endAddr = startAddr + sorted[i].registerCount - 1
    // j will scan forward to see how many items we can pack
    let j = i

    // 3) Try to include as many following entries as still fit under maxLength
    while (j + 1 < sorted.length) {
      // Check if current item is marked as group end - if so, stop here
      if (sorted[j].groupEnd) {
        break
      }

      const next = sorted[j + 1]
      const nextEnd = next.address + next.registerCount - 1
      const candidateEnd = Math.max(endAddr, nextEnd)
      const span = candidateEnd - startAddr + 1

      if (span <= maxLength) {
        endAddr = candidateEnd
        j++
      } else {
        break
      }
    }

    // 4) Compute final count = total registers from startAddr to endAddr (inclusive)
    const count = endAddr - startAddr + 1

    // 5) Record this block
    groups.push([startAddr, count])

    // 6) Advance i past all items we just grouped
    i = j + 1
  }

  return groups
}

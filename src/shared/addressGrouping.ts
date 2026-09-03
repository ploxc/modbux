import type { AddressGroup, DataType, RegisterMapObject, RegisterMapValue } from './types'
import { registerWidth } from './utils'

/** How far a string is read when nothing in the mapping says where it ends. */
const MAX_UTF8_READ_REGISTERS = 24

/**
 * How many registers to read for a mapped address.
 *
 * This is not `registerWidth`. A client's register mapping carries no length,
 * so the only thing saying where a string ends is the next mapped address.
 * `none` is an address with no data type, which is nothing to read at all.
 */
export const getReadSpan = (
  dataType: DataType,
  currentAddress: number,
  nextAddress?: number
): number => {
  if (dataType === 'none') return 0
  if (dataType !== 'utf8') return registerWidth(dataType)

  if (typeof nextAddress === 'number' && nextAddress > currentAddress) {
    return Math.min(nextAddress - currentAddress, MAX_UTF8_READ_REGISTERS)
  }
  return MAX_UTF8_READ_REGISTERS
}

/**
 * Build AddrInfo entries including correct registerCount.
 */
export const buildAddrInfos = (
  items: [string, RegisterMapValue][]
): Array<{ address: number; registerCount: number; groupEnd: boolean }> => {
  return items
    .map((item, index, arr) => {
      const dataType = item[1].dataType
      if (!dataType || dataType === 'none') return undefined

      const address = Number(item[0])

      const next = arr[index + 1]
      const nextAddress = next?.[0] ? Number(next[0]) : undefined
      const registerCount = getReadSpan(dataType, address, nextAddress)

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

  // The block being filled. `closed` is set by the item that carries groupEnd,
  // which ends the block after itself rather than before it.
  let open: { start: number; end: number; closed: boolean } | undefined

  const close = (): void => {
    if (open) groups.push([open.start, open.end - open.start + 1])
  }

  // 2) One pass: each item either extends the open block or starts the next
  for (const info of sorted) {
    const infoEnd = info.address + info.registerCount - 1

    if (open && !open.closed) {
      // 3) It fits when the whole block stays under maxLength
      const candidateEnd = Math.max(open.end, infoEnd)
      if (candidateEnd - open.start + 1 <= maxLength) {
        open.end = candidateEnd
        open.closed = info.groupEnd === true
        continue
      }
    }

    close()
    open = { start: info.address, end: infoEnd, closed: info.groupEnd === true }
  }

  close()

  return groups
}

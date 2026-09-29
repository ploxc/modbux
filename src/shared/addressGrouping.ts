import type {
  AddressGroup,
  DataType,
  RegisterMapObject,
  RegisterMapping,
  RegisterMapValue,
  RegisterType
} from './types'
import { isNumberRegister, MAX_READ_BITS } from './types'
import { registerWidth } from './encoding'

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
 * Whether a mapped address is one read configuration reads.
 *
 * A register is, once it has a data type. A bit has no data type column, so
 * the comment is all its mapping holds, and a bit with one is configured.
 */
export const isConfiguredAddress = (
  type: RegisterType,
  mapValue: RegisterMapValue | undefined
): mapValue is RegisterMapValue => {
  if (!mapValue) return false
  if (isNumberRegister(type)) return mapValue.dataType !== undefined && mapValue.dataType !== 'none'
  return (mapValue.comment ?? '').trim() !== ''
}

type AddrInfo = { address: number; registerCount: number; groupEnd: boolean }

/**
 * Group a list of AddrInfo items into minimal continuous Modbus read blocks.
 *
 * @param infos      - the addresses to read, each with its width
 * @param maxLength  - maximum addresses per read
 * @returns          - array of [startAddress, count]
 */
const groupInfos = (infos: AddrInfo[], maxLength: number): Array<AddressGroup> => {
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

/**
 * Group a register type's mapped registers into read blocks.
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
  const registerEntries = Object.entries(registers).filter(
    (entry): entry is [string, RegisterMapValue] =>
      isConfiguredAddress('holding_registers', entry[1])
  )
  return groupInfos(buildAddrInfos(registerEntries), maxLength)
}

/**
 * Group a bit type's commented bits into read blocks, each bit one wide, up to
 * the 2000 a single bit read carries.
 */
export const groupBitInfos = (
  bits: RegisterMapObject | undefined,
  maxLength: number = MAX_READ_BITS
): Array<AddressGroup> => {
  if (!bits) return []
  const infos = Object.entries(bits)
    .filter((entry): entry is [string, RegisterMapValue] => isConfiguredAddress('coils', entry[1]))
    .map(([address, mapValue]) => ({
      address: Number(address),
      registerCount: 1,
      groupEnd: mapValue.groupEnd === true
    }))
  return groupInfos(infos, maxLength)
}

/**
 * The groups a read takes out of the mapping, and nothing at all where a read
 * takes the toolbar's own group instead.
 *
 * `_readSection` asks two things before it reads a mapping: read configuration is
 * on, and the mapping has a group under the type. Falling through on either is
 * a raw read of the toolbar's address and length, which is the right answer
 * for a read and the wrong one for a caller asking whether the mapping is what
 * comes back.
 *
 * A register groups by its data type and a bit by its comment, which
 * `isConfiguredAddress` says.
 *
 * Here rather than in `_readSection`, because the renderer asks the same question.
 * `clearRegisterDataWhenIdle` redraws the mapping and asks main to fill it,
 * and where main would answer out of the toolbar group instead, what comes
 * back is not what was drawn.
 */
export const configuredReadGroups = (
  readConfiguration: boolean,
  type: RegisterType,
  registerMapping: RegisterMapping | undefined
): Array<AddressGroup> =>
  !readConfiguration
    ? []
    : isNumberRegister(type)
      ? groupAddressInfos(registerMapping?.[type])
      : groupBitInfos(registerMapping?.[type])

/**
 * Whether a read would ask for no registers: the toolbar's block, at a length
 * the field refused and kept.
 *
 * Read configuration reads its groups instead, and where it has none for the
 * type the toolbar's block goes out after all, so the length decides then too.
 * Main refuses a read and a poll on this, and Read and Poll grey out on it.
 */
export const readsNothing = (
  readConfiguration: boolean,
  type: RegisterType,
  registerMapping: RegisterMapping | undefined,
  lengthGiven: boolean
): boolean =>
  !lengthGiven && configuredReadGroups(readConfiguration, type, registerMapping).length === 0

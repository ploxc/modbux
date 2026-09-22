import { bigEndian32, bigEndian64, littleEndian32, littleEndian64 } from './encoding'
import type { RegisterData } from './types'
import round from 'lodash/round'
import { DateTime } from 'luxon'

export interface ReadRegisterResultLike {
  data: Array<number>
  buffer: Buffer
}

export interface ReadCoilResultLike {
  data: Array<boolean>
  buffer: Buffer
}

const parseIEC870Words = (word1: number, word2: number, word3: number, word4: number): string => {
  if (word1 === 0xffff && word2 === 0xffff && word3 === 0xffff && word4 === 0xffff) {
    return ''
  }

  const year = (word1 & 0b1111111) + 2000
  const day = word2 & 0b11111
  const month = (word2 >> 8) & 0b1111
  const minute = word3 & 0b111111
  const hour = (word3 >> 8) & 0b11111
  const totalMs = word4
  const second = Math.floor(totalMs / 1000)
  const millisecond = totalMs % 1000
  const isInvalid = (word3 & 0b10000000) !== 0

  // The year is not asked about. `word1 & 0b1111111` is 0 to 127 over all 65536
  // words a register can hold, so `year` is 2000 to 2127 before it is read, and
  // a guard on either end is a branch no register reaches. That is also why
  // `encodeIEC870DateTime` clamps: a year outside the window has no encoding,
  // and writing one masks it into a different valid year.
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    millisecond > 999 ||
    isInvalid
  ) {
    return ''
  }

  const datetime = DateTime.utc(year, month, day, hour, minute, second, millisecond)

  // The day is five bits and every month it is checked against is 28 to 31 days
  // long, so 02/31 passes every gate above and luxon formats it as the literal
  // `Invalid DateTime`.
  if (!datetime.isValid) return ''

  return datetime.toFormat('yyyy/MM/dd HH:mm:ss')
}

/** The IEC 870-5 datetime the four registers at an offset hold. */
export const parseIEC870DateTime = (buf: Buffer): string => {
  if (buf.length !== 8) return ''

  return parseIEC870Words(
    buf.readUInt16BE(0),
    buf.readUInt16BE(2),
    buf.readUInt16BE(4),
    buf.readUInt16BE(6)
  )
}

/**
 * The same datetime, read off the composite the server store keeps.
 *
 * The store folds the four registers into one `value`, so the row had its own
 * copy of the layout above, without the invalid flag and without the range gate.
 *
 * A `bigint` because the composite fills all 64 bits and a JS number carries 53
 * of them. Through `Number` the encoding of 2099/12/31 23:59:59.999 rounded up
 * by one millisecond, and the all-0xFFFF sentinel came out as 2 ** 64, which is
 * out of range rather than the sentinel.
 */
export const parseIEC870DateTimeValue = (packed: bigint): string =>
  parseIEC870Words(
    Number((packed >> 48n) & 0xffffn),
    Number((packed >> 32n) & 0xffffn),
    Number((packed >> 16n) & 0xffffn),
    Number(packed & 0xffffn)
  )

/** The `yyyy/MM/dd HH:mm:ss` a unix register's seconds stand for. */
export const formatUnixSeconds = (seconds: number): string =>
  DateTime.fromMillis(seconds * 1000)
    .toUTC()
    .toFormat('yyyy/MM/dd HH:mm:ss')

export const convertRegisterData = (
  result: ReadRegisterResultLike,
  address: number,
  littleEndian: boolean,
  isScanning: boolean
): RegisterData[] => {
  if (!result) return []

  const { buffer } = result
  const registerData: RegisterData[] = []

  // A register contains 16 bits, so we handle 2 bytes at a time. The floor is
  // for the odd buffer: modbus-serial slices this at the byte count the
  // response declares and never compares that field with the frame length it
  // checked, so a device that declares an odd one leaves a trailing byte no
  // register is made of.
  const registers = Math.floor(buffer.byteLength / 2)

  for (let i = 0; i < registers; i++) {
    const offset = i * 2 // Register (16 bits) = 2 bytes

    // Only read int32, uint32, and float if we have 2 or more registers left
    const inRange32 = i < registers - 1

    // Only read BigInt64 and Double if we have 4 or more registers left
    const inRange64 = i < registers - 3

    // Apply 32 bit endianness
    const buf32 = inRange32
      ? littleEndian
        ? littleEndian32(buffer, offset)
        : bigEndian32(buffer, offset)
      : undefined

    // Apply 64 bit endianness
    const buf64 = inRange64
      ? littleEndian
        ? littleEndian64(buffer, offset)
        : bigEndian64(buffer, offset)
      : undefined

    // Define row data, read big endian data
    const rowData: RegisterData = {
      id: address + i,
      buffer: buffer.subarray(offset, offset + 2),
      hex: buffer.subarray(offset, offset + 2).toString('hex'),
      words: {
        int16: buffer.readInt16BE(offset),
        uint16: buffer.readUInt16BE(offset),

        // 32 bits
        int32: buf32 ? buf32.readInt32BE(0) : 0,
        uint32: buf32 ? buf32.readUInt32BE(0) : 0,
        float: buf32 ? round(buf32.readFloatBE(0), 5) : 0,
        unix: buf32 ? formatUnixSeconds(buf32.readUInt32BE(0)) : '',

        // 64 bits
        int64: buf64 ? buf64.readBigInt64BE(0) : BigInt(0),
        uint64: buf64 ? buf64.readBigUInt64BE(0) : BigInt(0),
        double: buf64 ? round(buf64.readDoubleBE(0), 10) : 0,
        datetime: buf64 ? parseIEC870DateTime(buf64) : '',
        // Replace null values with spaces, starting from this register's
        // offset so character indexing aligns with register positions.
        //
        // The rest of the read, with no ceiling of its own, because the
        // protocol is the ceiling: FC03 and FC04 answer at most 125 registers,
        // so the widest tail here is 250 bytes. Holding it to
        // `MAX_UTF8_READ_REGISTERS` instead took a 125 register conversion
        // from 2.88 ms to 2.58 ms, median of 40, and cut what the grid draws
        // for a string read with read configuration off from 250 characters to
        // 48.
        utf8: Buffer.from(buffer.subarray(offset).map((b) => (b === 0 ? 32 : b))).toString('utf-8')
      },
      bit: false,
      isScanned: isScanning
    }

    registerData.push(rowData)
  }

  return registerData
}

export const convertBitData = (
  result: ReadCoilResultLike,
  address: number,
  length: number,
  isScanning: boolean
): RegisterData[] => {
  const { data } = result

  const registerData: RegisterData[] = []

  for (let i = 0; i < length; i++) {
    const bit = data[i] ?? false
    const rowData: RegisterData = {
      id: address + i,
      buffer: Buffer.from([0]),
      hex: '',
      words: undefined,
      bit,
      isScanned: isScanning
    }

    registerData.push(rowData)
  }

  return registerData
}

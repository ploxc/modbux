import { bigEndian32, bigEndian64, littleEndian32, littleEndian64 } from './utils'
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

export const parseIEC870DateTime = (buf: Buffer): string => {
  if (buf.length !== 8) return ''

  const word1 = buf.readUInt16BE(0)
  const word2 = buf.readUInt16BE(2)
  const word3 = buf.readUInt16BE(4)
  const word4 = buf.readUInt16BE(6)

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

  if (
    year < 2000 ||
    year > 2127 ||
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

  return DateTime.utc(year, month, day, hour, minute, second, millisecond).toFormat(
    'yyyy/MM/dd HH:mm:ss'
  )
}

export const convertRegisterData = (
  result: ReadRegisterResultLike,
  address: number,
  littleEndian: boolean,
  isScanning: boolean
): RegisterData[] => {
  if (!result) return []

  const { buffer } = result
  const registerData: RegisterData[] = []

  // A register contains 16 bits, so we handle 2 bytes at a time
  const registers = result.buffer.byteLength / 2

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
        unix: buf32
          ? DateTime.fromMillis(buf32.readUInt32BE(0) * 1000).toFormat('yyyy/MM/dd HH:mm:ss')
          : '',

        // 64 bits
        int64: buf64 ? buf64.readBigInt64BE(0) : BigInt(0),
        uint64: buf64 ? buf64.readBigUInt64BE(0) : BigInt(0),
        double: buf64 ? round(buf64.readDoubleBE(0), 10) : 0,
        datetime: buf64 ? parseIEC870DateTime(buf64) : '',
        // Replace null values with spaces
        utf8: Buffer.from(buffer.map((b) => (b === 0 ? 32 : b))).toString('utf-8')
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

import { DataType, RegisterType } from './types'

export const getConventionalAddress = (
  type: RegisterType,
  address: string,
  addressBase: string
) => {
  return type === RegisterType.DiscreteInputs
    ? Number(address) + 10000 + Number(addressBase)
    : type === RegisterType.HoldingRegisters
      ? Number(address) + 40000 + Number(addressBase)
      : type === RegisterType.InputRegisters
        ? Number(address) + 30000 + Number(addressBase)
        : Number(address) + Number(addressBase)
}

export const getBit = (word: number, bit: number) => (word & (2 ** bit)) === 2 ** bit

// Regular most significant word first (big endian)
export const bigEndian32 = (buffer: Buffer, offset: number) => {
  return buffer.subarray(offset, offset + 4)
}

// Uncommon least significant word first (little endian)
export const littleEndian32 = (buffer: Buffer, offset: number) => {
  return Buffer.concat([
    buffer.subarray(offset + 2, offset + 4) as Uint8Array,
    buffer.subarray(offset, offset + 2) as Uint8Array
  ])
}

// Regular most significant word first (big endian)
export const bigEndian64 = (buffer: Buffer, offset: number) => {
  return buffer.subarray(offset, offset + 8)
}

// Uncommon least significant word first (little endian)
export const littleEndian64 = (buffer: Buffer, offset: number) => {
  return Buffer.concat([
    buffer.subarray(offset + 6, offset + 8) as Uint8Array,
    buffer.subarray(offset + 4, offset + 6) as Uint8Array,
    buffer.subarray(offset + 2, offset + 4) as Uint8Array,
    buffer.subarray(offset, offset + 2) as Uint8Array
  ])
}

export const createRegisters = (
  dataType: DataType,
  value: number,
  littleEndian: boolean
): number[] => {
  let bufferSize = 2

  if ([DataType.Int32, DataType.UInt32, DataType.Float].includes(dataType)) bufferSize = 4
  if ([DataType.Int64, DataType.UInt64, DataType.Double].includes(dataType)) bufferSize = 8

  let buffer = Buffer.alloc(bufferSize)

  switch (dataType) {
    case DataType.Int16:
      buffer.writeInt16BE(value, 0)
      break
    case DataType.UInt16:
      buffer.writeUInt16BE(value, 0)
      break
    case DataType.Int32:
      buffer.writeInt32BE(value, 0)
      if (littleEndian) buffer = littleEndian32(buffer, 0)
      break
    case DataType.UInt32:
      buffer.writeUInt32BE(value, 0)
      if (littleEndian) buffer = littleEndian32(buffer, 0)
      break
    case DataType.Float:
      buffer.writeFloatBE(value, 0)
      if (littleEndian) buffer = littleEndian32(buffer, 0)
      break
    case DataType.Int64:
      buffer.writeBigInt64BE(BigInt(value), 0)
      if (littleEndian) buffer = littleEndian64(buffer, 0)
      break
    case DataType.UInt64:
      buffer.writeBigUInt64BE(BigInt(value), 0)
      if (littleEndian) buffer = littleEndian64(buffer, 0)
      break
    case DataType.Double:
      buffer.writeDoubleBE(value, 0)
      if (littleEndian) buffer = littleEndian64(buffer, 0)
      break
  }

  // Convert bytes to array of 16-bit words.
  const bytes = Array.from(buffer)
  const registers: number[] = []
  for (let i = 0; i < bytes.length; i += 2) {
    registers.push(bytes[i] * 256 + bytes[i + 1])
  }

  return registers
}

export const getMinMaxValues = (dataType: DataType): { min: number; max: number } => {
  switch (dataType) {
    case DataType.Int16:
      return { min: -32768, max: 32767 }
    case DataType.UInt16:
      return { min: 0, max: 65535 }
    case DataType.Int32:
      return { min: -2147483648, max: 2147483647 }
    case DataType.UInt32:
      return { min: 0, max: 4294967295 }
    case DataType.Int64:
      return { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER } // JavaScript safe integer range
    case DataType.UInt64:
      return { min: 0, max: Number.MAX_SAFE_INTEGER } // Max safe integer in JavaScript for unsigned 64-bit
    case DataType.Float:
      return { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY } // Closest approximation for float
    case DataType.Double:
      return { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY } // Double in JS is the same as float
    default:
      return { min: 0, max: 0 }
  }
}

export const notEmpty = (value: number | string) => String(value).replace('-', '').length > 0

export const getRegisterLength = (dataType: DataType) => {
  switch (dataType) {
    case DataType.Int16:
    case DataType.UInt16:
    case DataType.Float:
    case DataType.Double:
      return 1
    case DataType.Int32:
    case DataType.UInt32:
    case DataType.Unix:
      return 2
    case DataType.Int64:
    case DataType.UInt64:
    case DataType.DateTime:
      return 4
    case DataType.Utf8:
      return 8
    default:
      return 0
  }
}

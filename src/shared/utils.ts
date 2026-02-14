import { BaseDataType, DataType, RegisterParams, RegisterType, ServerRegisters } from './types'

export const getConventionalAddress = (
  type: RegisterType,
  address: string,
  addressBase: string
): number => {
  return type === 'discrete_inputs'
    ? Number(address) + 10000 + Number(addressBase)
    : type === 'holding_registers'
      ? Number(address) + 40000 + Number(addressBase)
      : type === 'input_registers'
        ? Number(address) + 30000 + Number(addressBase)
        : Number(address) + Number(addressBase)
}

export const getBit = (word: number, bit: number): boolean => (word & (2 ** bit)) === 2 ** bit

// Regular most significant word first (big endian)
export const bigEndian32 = (buffer: Buffer, offset: number): Buffer => {
  return buffer.subarray(offset, offset + 4)
}

// Uncommon least significant word first (little endian)
export const littleEndian32 = (buffer: Buffer, offset: number): Buffer<ArrayBuffer> => {
  return Buffer.concat([
    buffer.subarray(offset + 2, offset + 4) as Uint8Array,
    buffer.subarray(offset, offset + 2) as Uint8Array
  ])
}

// Regular most significant word first (big endian)
export const bigEndian64 = (buffer: Buffer, offset: number): Buffer => {
  return buffer.subarray(offset, offset + 8)
}

// Uncommon least significant word first (little endian)
export const littleEndian64 = (buffer: Buffer, offset: number): Buffer<ArrayBuffer> => {
  return Buffer.concat([
    buffer.subarray(offset + 6, offset + 8) as Uint8Array,
    buffer.subarray(offset + 4, offset + 6) as Uint8Array,
    buffer.subarray(offset + 2, offset + 4) as Uint8Array,
    buffer.subarray(offset, offset + 2) as Uint8Array
  ])
}

export const createRegisters = (
  dataType: BaseDataType,
  value: number,
  littleEndian: boolean
): number[] => {
  let bufferSize = 2

  if (['int32', 'uint32', 'float'].includes(dataType)) bufferSize = 4
  if (['int64', 'uint64', 'double'].includes(dataType)) bufferSize = 8

  let buffer = Buffer.alloc(bufferSize)

  switch (dataType) {
    case 'int16':
      buffer.writeInt16BE(value, 0)
      break
    case 'uint16':
      buffer.writeUInt16BE(value, 0)
      break
    case 'int32':
      buffer.writeInt32BE(value, 0)
      if (littleEndian) buffer = littleEndian32(buffer, 0)
      break
    case 'uint32':
      buffer.writeUInt32BE(value, 0)
      if (littleEndian) buffer = littleEndian32(buffer, 0)
      break
    case 'float':
      buffer.writeFloatBE(value, 0)
      if (littleEndian) buffer = littleEndian32(buffer, 0)
      break
    case 'int64':
      buffer.writeBigInt64BE(BigInt(value), 0)
      if (littleEndian) buffer = littleEndian64(buffer, 0)
      break
    case 'uint64':
      buffer.writeBigUInt64BE(BigInt(value), 0)
      if (littleEndian) buffer = littleEndian64(buffer, 0)
      break
    case 'double':
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
    case 'int16':
      return { min: -32768, max: 32767 }
    case 'uint16':
      return { min: 0, max: 65535 }
    case 'int32':
      return { min: -2147483648, max: 2147483647 }
    case 'uint32':
      return { min: 0, max: 4294967295 }
    case 'int64':
      return { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER } // JavaScript safe integer range
    case 'uint64':
      return { min: 0, max: Number.MAX_SAFE_INTEGER } // Max safe integer in JavaScript for unsigned 64-bit
    case 'float':
      return { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY } // Closest approximation for float
    case 'double':
      return { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY } // Double in JS is the same as float
    default:
      return { min: 0, max: 0 }
  }
}

export const notEmpty = (value: number | string): boolean =>
  String(value).replace('-', '').length > 0

export const humanizeSerialError = (error: Error, port?: string): string => {
  const prefix = port ? `${port}: ` : ''
  const msg = error.message.toLowerCase()
  if (msg.includes('file not found')) return `${prefix}Port not found or not available`
  if (msg.includes('access denied') || msg.includes('permission denied'))
    return `${prefix}Port access denied (already in use?)`
  return error.message
}

export const getUsedAddresses = (registers: RegisterParams[]): number[] => {
  const addressSet = new Set<number>()
  registers.forEach((p) => {
    if (['int16', 'uint16'].includes(p.dataType)) addressSet.add(p.address)
    if (['int32', 'uint32', 'float'].includes(p.dataType)) {
      addressSet.add(p.address)
      addressSet.add(p.address + 1)
    }

    if (['int64', 'uint64', 'double'].includes(p.dataType)) {
      addressSet.add(p.address)
      addressSet.add(p.address + 1)
      addressSet.add(p.address + 2)
      addressSet.add(p.address + 3)
    }
  })
  return Array.from(addressSet)
}

export const checkHasConfig = (reg: ServerRegisters | undefined): boolean => {
  const coils = reg?.coils ?? {}
  const hasCoils = Object.values(coils).some((v) => v)
  const discrete = reg?.discrete_inputs ?? {}
  const hasDiscrete = Object.values(discrete).some((v) => v)
  const hasInput = Object.values(reg?.input_registers ?? []).length > 0
  const hasHolding = Object.values(reg?.holding_registers ?? []).length > 0
  return hasCoils || hasDiscrete || hasInput || hasHolding
}

export function getAddressFitError(dataType: BaseDataType, address: number): boolean {
  let size = 1
  if (['int32', 'uint32', 'float'].includes(dataType)) size = 2
  if (['int64', 'uint64', 'double'].includes(dataType)) size = 4
  return address + size - 1 > 65535
}

export const findAvailablePort = (usedPorts: number[]): number | undefined => {
  const MIN_PORT = 502
  const MAX_PORT = 1000

  const usedSet = new Set(usedPorts)

  const startPort = Math.max(MIN_PORT, Math.min(MAX_PORT, Math.max(...usedPorts, MIN_PORT - 1) + 1))

  for (let port = startPort; port <= MAX_PORT; port++) {
    if (!usedSet.has(port)) return port
  }

  for (let port = MIN_PORT; port < startPort; port++) {
    if (!usedSet.has(port)) return port
  }

  return undefined
}

export function snakeToCamel<S extends string>(str: S): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

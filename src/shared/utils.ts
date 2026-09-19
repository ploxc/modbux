// `types/server.ts` imports `getAddressFitError` and `getValueRangeError` from
// here, so this reads the barrel no longer: it would be a cycle through
// `types/index.ts`. `import type` says which names the compiler erases, and the
// cycle back through `types/server.ts` is one of them. `DataTypeSchema` is the
// one value below, out of a module that imports zod and nothing else.
import type { CamelCase } from './types/helpers'
import { DataTypeSchema, type DataType, type EncodableDataType } from './types/datatype'
import type { RegisterParams, ServerRegisters } from './types/server'

/**
 * Whether bit `bit` of `word` is set.
 *
 * `&` is a 32 bit signed operation, so `word & (2 ** bit)` answered false for
 * bit 31 of 2 ** 31 and for every bit above it. Both callers ask for bits 0 to
 * 15 of a one register bitmap, which `BitMapConfigSchema` and `registerWidth`
 * hold them to, so the arithmetic answers a question nothing asks yet.
 */
export const getBit = (word: number, bit: number): boolean => Math.floor(word / 2 ** bit) % 2 === 1

/** The width the add dialog offers for a string when the field is left alone. */
export const DEFAULT_UTF8_LENGTH = 10

/**
 * The widest string a register map holds, which is the add dialog's own mask.
 *
 * The protocol puts a ceiling under it either way: FC3 and FC4 answer at most
 * 125 registers, so a string wider than that cannot be read in one request.
 * The number here is the one `RegisterLengthInput` has always masked to, and
 * `RegisterParamsBasePartSchema` states it too, because a config file is the
 * other door and the map is the only thing that bounded it there: one string of
 * 65536 made `addRegister` send 65536 `register_value` messages in one
 * synchronous loop.
 */
export const MAX_UTF8_LENGTH = 124

/**
 * How many registers a value of this type occupies.
 *
 * One answer, because this was stated seven times and the copies disagreed on
 * `utf8`, so deleting a string erased registers belonging to its neighbours.
 * The switch is exhaustive: a new DataType is a type error here.
 */
export const registerWidth = (dataType: DataType, length?: number): number => {
  switch (dataType) {
    case 'utf8':
      return length ?? DEFAULT_UTF8_LENGTH

    case 'int32':
    case 'uint32':
    case 'float':
    case 'unix':
      return 2

    case 'int64':
    case 'uint64':
    case 'double':
    case 'datetime':
      return 4

    case 'none':
    case 'int16':
    case 'uint16':
    case 'bitmap':
      return 1
  }
}

/**
 * The most registers a number spans. A word belongs to a register starting at
 * its own address or at one of the `MAX_NUMBER_REGISTER_WIDTH - 1` before it.
 *
 * Read off the table above rather than written again, so a wider type is one
 * edit. `utf8` is left out because its width is the length the user chose, and
 * a string composes no value out of the words around it.
 */
export const MAX_NUMBER_REGISTER_WIDTH = Math.max(
  ...DataTypeSchema.options
    .filter((dataType) => dataType !== 'utf8')
    .map((dataType) => registerWidth(dataType))
)

// Regular most significant word first (big endian)
export const bigEndian32 = (buffer: Buffer, offset: number): Buffer => {
  return buffer.subarray(offset, offset + 4)
}

/**
 * Uncommon least significant word first (little endian).
 *
 * `littleBigEndian.md`, beside this file, puts 0x12345678 through both orders
 * and gives the SCL that writes either one from a Siemens PLC.
 */
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
  dataType: EncodableDataType,
  value: number,
  littleEndian: boolean
): [number, ...number[]] => {
  let buffer = Buffer.alloc(registerWidth(dataType) * 2)

  switch (dataType) {
    case 'int16':
      buffer.writeInt16BE(value, 0)
      break
    case 'uint16':
    case 'bitmap':
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
    case 'unix':
      buffer.writeUInt32BE(value >>> 0, 0)
      if (littleEndian) buffer = littleEndian32(buffer, 0)
      break
    case 'datetime':
      buffer = encodeIEC870DateTime(value)
      if (littleEndian) buffer = littleEndian64(buffer, 0)
      break
  }

  // Convert bytes to array of 16-bit words. `registerWidth` is one at its
  // smallest over this type, so the first word is always there and the return
  // type says so: `_writeRegister` sends registers[0] to FC6.
  const registers: [number, ...number[]] = [buffer.readUInt16BE(0)]
  for (let i = 2; i < buffer.length; i += 2) {
    registers.push(buffer.readUInt16BE(i))
  }

  return registers
}

/**
 * The window an IEC 870-5 datetime can carry, in milliseconds.
 *
 * The format holds the year as a seven bit offset from 2000, so 2000 through
 * 2127 is the whole of it and a year outside has no encoding at all.
 * `parseIEC870DateTime` cannot say so, because the same seven bits mask a wrong
 * year into a right-looking one on the way back, which is why this is the
 * encoder's question. Both ends are stated once: `getMinMaxValues` hands them to
 * the mask and `encodeIEC870DateTime` clamps to them, and a mask wider than the
 * clamp accepts a date the register does not get.
 */
const IEC870_MIN_MS = Date.UTC(2000, 0, 1)
const IEC870_MAX_MS = Date.UTC(2127, 11, 31, 23, 59, 59, 999)

/**
 * Encode a timestamp (milliseconds) to IEC 870-5 datetime format (8 bytes / 4 registers).
 *
 * Only the low end clamped, and the decoder masks the year to seven bits, so
 * 2200 came back as 2072 with nothing to say it had moved.
 */
export const encodeIEC870DateTime = (timestampMs: number): Buffer<ArrayBuffer> => {
  const dt = new Date(Math.min(Math.max(timestampMs, IEC870_MIN_MS), IEC870_MAX_MS))
  const buf = Buffer.alloc(8)
  buf.writeUInt16BE(dt.getUTCFullYear() - 2000, 0)
  buf.writeUInt16BE(((dt.getUTCMonth() + 1) << 8) | dt.getUTCDate(), 2)
  buf.writeUInt16BE((dt.getUTCHours() << 8) | dt.getUTCMinutes(), 4)
  buf.writeUInt16BE(dt.getUTCSeconds() * 1000 + dt.getUTCMilliseconds(), 6)
  return buf
}

/**
 * Encode a UTF-8 string to Modbus registers (null-padded).
 */
export const createStringRegisters = (text: string, registerCount: number): number[] => {
  const byteLength = registerCount * 2
  const buf = Buffer.alloc(byteLength, 0)
  buf.write(text, 'utf-8')
  const registers: number[] = []
  for (let i = 0; i < byteLength; i += 2) {
    registers.push(buf.readUInt16BE(i))
  }
  return registers
}

export const getMinMaxValues = (dataType: DataType): { min: number; max: number } => {
  switch (dataType) {
    case 'int16':
      return { min: -32768, max: 32767 }
    case 'uint16':
    case 'bitmap':
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
    case 'unix':
      return { min: 0, max: 4294967295 } // uint32 range (seconds since epoch)
    case 'datetime':
      // Milliseconds, which is the unit `createRegisters` hands the encoder.
      // Stated in seconds, the whole range encoded to the clamp floor.
      return { min: IEC870_MIN_MS, max: IEC870_MAX_MS }
    case 'none':
    case 'utf8':
      return { min: 0, max: 0 } // Neither holds a number
  }
}

/**
 * What a server register entry holds, which is not always a number.
 *
 * A decimal string for the three types whose composite fills 64 bits as an
 * integer. It was `z.number()` for all of them: `applyRegisterValue` read the
 * composite back with `getBigUint64` and stored `Number(...)`, so four words of
 * 0xFFFF came out 18446744073709552000 rather than 18446744073709551615, and
 * `setBigUint64` takes its argument modulo 2 ** 64 rather than throwing, so the
 * next single word write on that entry collapsed it to the low word alone.
 * Measured: one more word after the flush left the entry holding 1.
 *
 * A string rather than a `bigint` because the store is persisted through
 * `JSON.stringify`, which refuses a bigint outright.
 */
export type ServerRegisterValue = number | string

/**
 * The types whose composite fills 64 bits as an integer.
 *
 * `applyRegisterValue` reads these three back with `getBigInt64` or
 * `getBigUint64`. `double` is the fourth type four registers wide and is not
 * here: its composite is a float64, which is exactly what a JS number is.
 */
export const holdsExact64Bits = (dataType: DataType): boolean =>
  dataType === 'int64' || dataType === 'uint64' || dataType === 'datetime'

/**
 * The exact composite a stored value stands for, or nothing when it stands for
 * none.
 *
 * Takes a `bigint` as well, because `ServerDelayedSetter` holds the composite
 * it last folded and that is the value the next word write reads first.
 *
 * `undefined` rather than `0n`, so a caller merging one word into a composite
 * aborts rather than rebuilding it from zero: the other three registers are
 * what zero would cost. `BigInt` throws on a fraction and on anything that is
 * not digits, and `ServerRegisterEntrySchema` takes a fractional number for a
 * 64 bit type, so a hand-edited config reaches this.
 */
export const toExact64Bits = (value: ServerRegisterValue | bigint): bigint | undefined => {
  try {
    return BigInt(value)
  } catch {
    return undefined
  }
}

/**
 * The types `createRegisters` throws on for a value outside their range.
 *
 * Measured against the writers it calls. `writeUInt16BE(1.5)` and
 * `writeInt32BE(1.5)` truncate, `writeFloatBE(1e300)` and `writeDoubleBE` take
 * anything, `unix` is written through `value >>> 0` and `datetime` through
 * `encodeIEC870DateTime`, which clamps to the format's own window. What is left
 * is the seven below, where `writeUInt32BE(-1)` and
 * `writeBigUInt64BE(2n ** 64n)` both answer ERR_OUT_OF_RANGE. `none` and `utf8`
 * are not `EncodableDataType` and never reach the encoder at all.
 */
const RANGE_CHECKED_TYPES: readonly DataType[] = [
  'int16',
  'uint16',
  'bitmap',
  'int32',
  'uint32',
  'int64',
  'uint64'
]

/**
 * Why `createRegisters` cannot encode `value` as `dataType`, or nothing.
 *
 * `RegisterParamsSchema` bounded the address and left the value bare, so a
 * config file carrying `{ dataType: 'uint16', value: 70000 }` reached
 * `writeUInt16BE` and threw out of `addRegister`. The ranges are
 * `getMinMaxValues`, which the add dialog's mask already reads, so the file and
 * the field now answer the same question.
 *
 * A 64 bit value also has to be a whole number, because `BigInt(1.5)` throws
 * where `writeUInt16BE(1.5)` truncates.
 */
export const getValueRangeError = (dataType: DataType, value: number): string | undefined => {
  if (!RANGE_CHECKED_TYPES.includes(dataType)) return undefined

  if ((dataType === 'int64' || dataType === 'uint64') && !Number.isInteger(value)) {
    return `A ${dataType} value has to be a whole number`
  }

  const { min, max } = getMinMaxValues(dataType)
  if (value < min || value > max) {
    return `A ${dataType} value has to be between ${min} and ${max}`
  }

  return undefined
}

/**
 * Whether the mask has taken anything a number could be made of.
 *
 * A lone `'-'` is a sign with no digits behind it. `.replace('-', '')` takes the
 * first one only, so `'--'` passed as a value.
 */
export const notEmpty = (value: number | string): boolean =>
  String(value).replace(/-/g, '').length > 0

/** What to show for a serial error, named by the port it came from. */
export const humanizeSerialError = (error: Error, port?: string): string => {
  const prefix = port ? `${port}: ` : ''
  const msg = (error.message || '').toLowerCase()
  if (msg.includes('file not found')) return `${prefix}Port not found or not available`
  if (msg.includes('access denied') || msg.includes('permission denied'))
    return `${prefix}Port access denied (already in use?)`
  return `${prefix}${error.message || `Connection failed${error['code'] ? ` (${error['code']})` : ''}`}`
}

export const getUsedAddresses = (registers: RegisterParams[]): number[] => {
  const addressSet = new Set<number>()
  registers.forEach((p) => {
    const size = registerWidth(p.dataType, p.length)

    for (let i = 0; i < size; i++) {
      addressSet.add(p.address + i)
    }
  })
  return Array.from(addressSet)
}

/**
 * Whether a unit carries anything the user put there.
 *
 * A bool counts because it exists, not because it is on. `addBool` writes
 * `{ value: false }`, so the coil you add and leave off is an entry like any
 * other, and reading the value instead dropped exactly that unit from a saved
 * config.
 */
export const checkHasConfig = (reg: ServerRegisters | undefined): boolean => {
  const hasCoils = Object.keys(reg?.coils ?? {}).length > 0
  const hasDiscrete = Object.keys(reg?.discrete_inputs ?? {}).length > 0
  const hasInput = Object.keys(reg?.input_registers ?? {}).length > 0
  const hasHolding = Object.keys(reg?.holding_registers ?? {}).length > 0
  return hasCoils || hasDiscrete || hasInput || hasHolding
}

export function getAddressFitError(dataType: DataType, address: number, length?: number): boolean {
  return address + registerWidth(dataType, length) - 1 > 65535
}

export const findAvailablePort = (usedPorts: number[]): number | undefined => {
  const MIN_PORT = 502
  const MAX_PORT = 10502

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

/**
 * The camelCase method name a snake_case channel becomes on `window.api`.
 *
 * The cast is what no compiler can do for a string replace, and it sits here
 * rather than at the call site so every caller is checked against it. It holds
 * for names of lowercase segments, which is the shape the conformance suite
 * requires of `IPC_CHANNELS`: `_([a-z])` leaves a digit or a capital where it
 * stands, and `CamelCase` would capitalise it.
 */
export function snakeToCamel<S extends string>(str: S): CamelCase<S> {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()) as CamelCase<S>
}

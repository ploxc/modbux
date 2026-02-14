/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect } from 'vitest'
import { parseIEC870DateTime, convertRegisterData, convertBitData } from '../conversion'

describe('parseIEC870DateTime', () => {
  it('returns empty string for wrong buffer length', () => {
    expect(parseIEC870DateTime(Buffer.alloc(4))).toBe('')
    expect(parseIEC870DateTime(Buffer.alloc(10))).toBe('')
  })

  it('returns empty string for all-0xFFFF sentinel', () => {
    const buf = Buffer.alloc(8, 0xff)
    expect(parseIEC870DateTime(buf)).toBe('')
  })

  it('returns empty string when invalid flag is set', () => {
    // word3 bit 7 (0x80) = invalid
    const buf = Buffer.alloc(8, 0)
    buf.writeUInt16BE(25, 0) // year = 2025
    buf.writeUInt16BE((6 << 8) | 15, 2) // month=6, day=15
    buf.writeUInt16BE(0x0080 | (10 << 8) | 30, 4) // hour=10, minute=30 + invalid flag
    buf.writeUInt16BE(0, 6) // 0ms
    expect(parseIEC870DateTime(buf)).toBe('')
  })

  it('returns empty string for out-of-range month', () => {
    const buf = Buffer.alloc(8, 0)
    buf.writeUInt16BE(25, 0) // year 2025
    buf.writeUInt16BE((13 << 8) | 1, 2) // month=13 (invalid), day=1
    buf.writeUInt16BE((10 << 8) | 0, 4) // hour=10, minute=0
    buf.writeUInt16BE(0, 6)
    expect(parseIEC870DateTime(buf)).toBe('')
  })

  it('returns empty string for out-of-range day', () => {
    const buf = Buffer.alloc(8, 0)
    buf.writeUInt16BE(25, 0) // year 2025
    buf.writeUInt16BE((1 << 8) | 0, 2) // month=1, day=0 (invalid)
    buf.writeUInt16BE((10 << 8) | 0, 4)
    buf.writeUInt16BE(0, 6)
    expect(parseIEC870DateTime(buf)).toBe('')
  })

  it('returns empty string for hour > 23', () => {
    const buf = Buffer.alloc(8, 0)
    buf.writeUInt16BE(25, 0)
    buf.writeUInt16BE((6 << 8) | 15, 2) // month=6, day=15
    buf.writeUInt16BE((24 << 8) | 30, 4) // hour=24 (invalid)
    buf.writeUInt16BE(0, 6)
    expect(parseIEC870DateTime(buf)).toBe('')
  })

  it('returns empty string for minute > 59', () => {
    const buf = Buffer.alloc(8, 0)
    buf.writeUInt16BE(25, 0)
    buf.writeUInt16BE((6 << 8) | 15, 2)
    buf.writeUInt16BE((10 << 8) | 60, 4) // minute=60 (invalid)
    buf.writeUInt16BE(0, 6)
    expect(parseIEC870DateTime(buf)).toBe('')
  })

  it('returns empty string for second > 59', () => {
    const buf = Buffer.alloc(8, 0)
    buf.writeUInt16BE(25, 0)
    buf.writeUInt16BE((6 << 8) | 15, 2)
    buf.writeUInt16BE((10 << 8) | 30, 4)
    buf.writeUInt16BE(60_000, 6) // 60 seconds (invalid)
    expect(parseIEC870DateTime(buf)).toBe('')
  })

  it('parses a valid IEC 870-5 datetime', () => {
    // 2025-03-15 14:30:45.123
    const buf = Buffer.alloc(8)
    buf.writeUInt16BE(25, 0) // year = 2025 (25 + 2000)
    buf.writeUInt16BE((3 << 8) | 15, 2) // month=3, day=15
    buf.writeUInt16BE((14 << 8) | 30, 4) // hour=14, minute=30
    buf.writeUInt16BE(45 * 1000 + 123, 6) // 45.123 seconds

    expect(parseIEC870DateTime(buf)).toBe('2025/03/15 14:30:45')
  })

  it('parses midnight correctly', () => {
    const buf = Buffer.alloc(8)
    buf.writeUInt16BE(24, 0) // year 2024
    buf.writeUInt16BE((1 << 8) | 1, 2) // Jan 1
    buf.writeUInt16BE(0, 4) // hour=0, minute=0
    buf.writeUInt16BE(0, 6) // 0 ms

    expect(parseIEC870DateTime(buf)).toBe('2024/01/01 00:00:00')
  })

  it('parses end of day correctly', () => {
    const buf = Buffer.alloc(8)
    buf.writeUInt16BE(24, 0) // year 2024
    buf.writeUInt16BE((12 << 8) | 31, 2) // Dec 31
    buf.writeUInt16BE((23 << 8) | 59, 4) // 23:59
    buf.writeUInt16BE(59 * 1000 + 999, 6) // 59.999 seconds

    expect(parseIEC870DateTime(buf)).toBe('2024/12/31 23:59:59')
  })
})

describe('convertRegisterData', () => {
  const makeResult = (values: number[]) => {
    const buf = Buffer.alloc(values.length * 2)
    values.forEach((v, i) => buf.writeUInt16BE(v, i * 2))
    return { data: values, buffer: buf }
  }

  it('returns empty array for null-ish result', () => {
    expect(convertRegisterData(null as never, 0, false, false)).toEqual([])
  })

  it('converts a single register (uint16)', () => {
    const result = makeResult([1234])
    const data = convertRegisterData(result, 100, false, false)

    expect(data).toHaveLength(1)
    expect(data[0].id).toBe(100)
    expect(data[0].words?.uint16).toBe(1234)
    expect(data[0].words?.int16).toBe(1234)
    expect(data[0].bit).toBe(false)
    expect(data[0].isScanned).toBe(false)
  })

  it('sets isScanned flag', () => {
    const result = makeResult([0])
    const data = convertRegisterData(result, 0, false, true)
    expect(data[0].isScanned).toBe(true)
  })

  it('converts multiple registers with correct ids', () => {
    const result = makeResult([10, 20, 30])
    const data = convertRegisterData(result, 5, false, false)

    expect(data).toHaveLength(3)
    expect(data[0].id).toBe(5)
    expect(data[1].id).toBe(6)
    expect(data[2].id).toBe(7)
  })

  it('reads 32-bit values across two registers (big endian)', () => {
    // int32 value: 70000 = 0x00011170
    const result = makeResult([0x0001, 0x1170])
    const data = convertRegisterData(result, 0, false, false)

    expect(data[0].words?.int32).toBe(70000)
    expect(data[0].words?.uint32).toBe(70000)
  })

  it('reads 32-bit values with little endian word swap', () => {
    // int32 70000 = 0x00011170 → big endian words [0x0001, 0x1170]
    // When written in big endian and read with little endian swap:
    const result = makeResult([0x1170, 0x0001])
    const data = convertRegisterData(result, 0, true, false)

    expect(data[0].words?.int32).toBe(70000)
  })

  it('reads float values', () => {
    // float 3.14 in big endian
    const buf = Buffer.alloc(4)
    buf.writeFloatBE(3.14, 0)
    const hi = buf.readUInt16BE(0)
    const lo = buf.readUInt16BE(2)

    const result = makeResult([hi, lo])
    const data = convertRegisterData(result, 0, false, false)

    expect(data[0].words?.float).toBeCloseTo(3.14, 2)
  })

  it('reads 64-bit values with little endian word swap', () => {
    // double 1.0 in big endian = 0x3FF0_0000_0000_0000
    // LE word swap reverses the 4 words
    const buf = Buffer.alloc(8)
    buf.writeDoubleBE(1.0, 0)
    const w0 = buf.readUInt16BE(0)
    const w1 = buf.readUInt16BE(2)
    const w2 = buf.readUInt16BE(4)
    const w3 = buf.readUInt16BE(6)

    // Feed words in swapped order (little endian word order)
    const result = makeResult([w3, w2, w1, w0])
    const data = convertRegisterData(result, 0, true, false)

    expect(data[0].words?.double).toBe(1.0)
  })

  it('reads 64-bit values across four registers', () => {
    // double 1.0 in big endian = 0x3FF0000000000000
    const buf = Buffer.alloc(8)
    buf.writeDoubleBE(1.0, 0)
    const w0 = buf.readUInt16BE(0)
    const w1 = buf.readUInt16BE(2)
    const w2 = buf.readUInt16BE(4)
    const w3 = buf.readUInt16BE(6)

    const result = makeResult([w0, w1, w2, w3])
    const data = convertRegisterData(result, 0, false, false)

    expect(data[0].words?.double).toBe(1.0)
  })

  it('returns 0 for 32-bit fields on the last register', () => {
    const result = makeResult([1234])
    const data = convertRegisterData(result, 0, false, false)

    // Only 1 register, so 32-bit values should default to 0
    expect(data[0].words?.int32).toBe(0)
    expect(data[0].words?.float).toBe(0)
  })

  it('returns 0 / BigInt(0) for 64-bit fields with fewer than 4 registers', () => {
    const result = makeResult([1, 2])
    const data = convertRegisterData(result, 0, false, false)

    expect(data[0].words?.int64).toBe(BigInt(0))
    expect(data[0].words?.uint64).toBe(BigInt(0))
    expect(data[0].words?.double).toBe(0)
  })

  it('produces correct hex representation', () => {
    const result = makeResult([0x00ff])
    const data = convertRegisterData(result, 0, false, false)
    expect(data[0].hex).toBe('00ff')
  })

  it('replaces null bytes with spaces in utf8', () => {
    // Buffer with null (0x00) bytes
    const result = makeResult([0x4100]) // 'A' followed by null
    const data = convertRegisterData(result, 0, false, false)
    // The null byte should become a space (0x20)
    expect(data[0].words?.utf8).toContain('A')
    expect(data[0].words?.utf8).not.toContain('\0')
  })
})

describe('convertBitData', () => {
  it('converts boolean array to RegisterData', () => {
    const result = { data: [true, false, true], buffer: Buffer.alloc(1) }
    const data = convertBitData(result, 10, 3, false)

    expect(data).toHaveLength(3)
    expect(data[0].id).toBe(10)
    expect(data[0].bit).toBe(true)
    expect(data[1].id).toBe(11)
    expect(data[1].bit).toBe(false)
    expect(data[2].id).toBe(12)
    expect(data[2].bit).toBe(true)
  })

  it('sets isScanned flag', () => {
    const result = { data: [false], buffer: Buffer.alloc(1) }
    const data = convertBitData(result, 0, 1, true)
    expect(data[0].isScanned).toBe(true)
  })

  it('defaults missing bits to false', () => {
    const result = { data: [true], buffer: Buffer.alloc(1) }
    // length=3 but data only has 1 element
    const data = convertBitData(result, 0, 3, false)

    expect(data[0].bit).toBe(true)
    expect(data[1].bit).toBe(false)
    expect(data[2].bit).toBe(false)
  })

  it('sets words to undefined for bit data', () => {
    const result = { data: [true], buffer: Buffer.alloc(1) }
    const data = convertBitData(result, 0, 1, false)
    expect(data[0].words).toBeUndefined()
  })

  it('sets hex to empty string for bit data', () => {
    const result = { data: [true], buffer: Buffer.alloc(1) }
    const data = convertBitData(result, 0, 1, false)
    expect(data[0].hex).toBe('')
  })
})

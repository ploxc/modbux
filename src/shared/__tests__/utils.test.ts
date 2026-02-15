import { describe, it, expect } from 'vitest'
import {
  getConventionalAddress,
  getBit,
  bigEndian32,
  littleEndian32,
  bigEndian64,
  littleEndian64,
  createRegisters,
  getMinMaxValues,
  notEmpty,
  humanizeSerialError
} from '../utils'
import { getDummyRegisterData, dummyWords, MAIN_SERVER_UUID } from '../default'

// ---------------------------------------------------------------------------
// getConventionalAddress
// ---------------------------------------------------------------------------
describe('getConventionalAddress', () => {
  it('adds 0 offset for coils', () => {
    expect(getConventionalAddress('coils', '10', '0')).toBe(10)
    expect(getConventionalAddress('coils', '10', '1')).toBe(11)
  })

  it('adds 10000 offset for discrete_inputs', () => {
    expect(getConventionalAddress('discrete_inputs', '5', '0')).toBe(10005)
    expect(getConventionalAddress('discrete_inputs', '5', '1')).toBe(10006)
  })

  it('adds 30000 offset for input_registers', () => {
    expect(getConventionalAddress('input_registers', '100', '0')).toBe(30100)
    expect(getConventionalAddress('input_registers', '100', '1')).toBe(30101)
  })

  it('adds 40000 offset for holding_registers', () => {
    expect(getConventionalAddress('holding_registers', '0', '0')).toBe(40000)
    expect(getConventionalAddress('holding_registers', '0', '1')).toBe(40001)
  })
})

// ---------------------------------------------------------------------------
// getBit
// ---------------------------------------------------------------------------
describe('getBit', () => {
  it('returns correct bit from a word', () => {
    // 0b1010 = 10
    expect(getBit(0b1010, 0)).toBe(false)
    expect(getBit(0b1010, 1)).toBe(true)
    expect(getBit(0b1010, 2)).toBe(false)
    expect(getBit(0b1010, 3)).toBe(true)
  })

  it('returns false for bits beyond the value', () => {
    expect(getBit(1, 15)).toBe(false)
  })

  it('handles 0xFFFF (all bits set)', () => {
    for (let i = 0; i < 16; i++) {
      expect(getBit(0xffff, i)).toBe(true)
    }
  })

  it('handles 0 (no bits set)', () => {
    for (let i = 0; i < 16; i++) {
      expect(getBit(0, i)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Endianness helpers (32-bit)
// ---------------------------------------------------------------------------
describe('bigEndian32', () => {
  it('returns 4 bytes starting at offset', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
    const result = bigEndian32(buf, 0)
    expect(result).toEqual(Buffer.from([0x00, 0x01, 0x02, 0x03]))
  })

  it('respects offset', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
    const result = bigEndian32(buf, 2)
    expect(result).toEqual(Buffer.from([0x02, 0x03, 0x04, 0x05]))
  })
})

describe('littleEndian32', () => {
  it('swaps the two 16-bit words', () => {
    // Input:  [W1_hi, W1_lo, W2_hi, W2_lo] at offset 0
    // Output: [W2_hi, W2_lo, W1_hi, W1_lo]
    const buf = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd])
    const result = littleEndian32(buf, 0)
    expect(result).toEqual(Buffer.from([0xcc, 0xdd, 0xaa, 0xbb]))
  })
})

// ---------------------------------------------------------------------------
// Endianness helpers (64-bit)
// ---------------------------------------------------------------------------
describe('bigEndian64', () => {
  it('returns 8 bytes starting at offset', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])
    const result = bigEndian64(buf, 0)
    expect(result).toEqual(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]))
  })
})

describe('littleEndian64', () => {
  it('reverses the four 16-bit words', () => {
    // Input:  [W1, W2, W3, W4] → Output: [W4, W3, W2, W1]
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])
    const result = littleEndian64(buf, 0)
    expect(result).toEqual(Buffer.from([0x06, 0x07, 0x04, 0x05, 0x02, 0x03, 0x00, 0x01]))
  })
})

// ---------------------------------------------------------------------------
// createRegisters
// ---------------------------------------------------------------------------
describe('createRegisters', () => {
  describe('int16', () => {
    it('converts positive value', () => {
      const regs = createRegisters('int16', 1234, false)
      expect(regs).toHaveLength(1)
      expect(regs[0]).toBe(1234)
    })

    it('converts negative value', () => {
      const regs = createRegisters('int16', -1, false)
      expect(regs).toHaveLength(1)
      // -1 in int16 big-endian = 0xFFFF = 65535
      expect(regs[0]).toBe(65535)
    })

    it('converts zero', () => {
      expect(createRegisters('int16', 0, false)).toEqual([0])
    })

    it('converts max value (32767)', () => {
      const regs = createRegisters('int16', 32767, false)
      expect(regs[0]).toBe(32767)
    })

    it('converts min value (-32768)', () => {
      const regs = createRegisters('int16', -32768, false)
      expect(regs[0]).toBe(32768) // 0x8000
    })

    it('ignores littleEndian flag (only 1 register)', () => {
      expect(createRegisters('int16', 100, true)).toEqual(createRegisters('int16', 100, false))
    })
  })

  describe('uint16', () => {
    it('converts positive value', () => {
      expect(createRegisters('uint16', 65535, false)).toEqual([65535])
    })

    it('converts zero', () => {
      expect(createRegisters('uint16', 0, false)).toEqual([0])
    })
  })

  describe('int32 (big endian)', () => {
    it('converts positive value to 2 registers', () => {
      const regs = createRegisters('int32', 70000, false)
      expect(regs).toHaveLength(2)
      // 70000 = 0x00011170 → registers: [0x0001, 0x1170] = [1, 4464]
      expect(regs[0]).toBe(1)
      expect(regs[1]).toBe(4464)
    })

    it('converts negative value', () => {
      const regs = createRegisters('int32', -1, false)
      // -1 = 0xFFFFFFFF → [0xFFFF, 0xFFFF] = [65535, 65535]
      expect(regs).toEqual([65535, 65535])
    })
  })

  describe('int32 (little endian)', () => {
    it('swaps words compared to big endian', () => {
      const be = createRegisters('int32', 70000, false)
      const le = createRegisters('int32', 70000, true)
      expect(le).toHaveLength(2)
      // Little endian swaps the two 16-bit words
      expect(le[0]).toBe(be[1])
      expect(le[1]).toBe(be[0])
    })
  })

  describe('uint32', () => {
    it('converts max uint32', () => {
      const regs = createRegisters('uint32', 4294967295, false)
      expect(regs).toEqual([65535, 65535])
    })

    it('converts zero', () => {
      expect(createRegisters('uint32', 0, false)).toEqual([0, 0])
    })
  })

  describe('float', () => {
    it('converts 1.0 to correct registers', () => {
      const regs = createRegisters('float', 1.0, false)
      expect(regs).toHaveLength(2)
      // IEEE 754: 1.0f = 0x3F800000 → [0x3F80, 0x0000] = [16256, 0]
      expect(regs[0]).toBe(16256)
      expect(regs[1]).toBe(0)
    })

    it('converts -1.5 correctly', () => {
      const regs = createRegisters('float', -1.5, false)
      expect(regs).toHaveLength(2)
      // -1.5f = 0xBFC00000 → [0xBFC0, 0x0000]
      expect(regs[0]).toBe(0xbfc0)
      expect(regs[1]).toBe(0)
    })

    it('handles little endian word swap', () => {
      const be = createRegisters('float', 3.14, false)
      const le = createRegisters('float', 3.14, true)
      expect(le[0]).toBe(be[1])
      expect(le[1]).toBe(be[0])
    })
  })

  describe('int64', () => {
    it('converts to 4 registers', () => {
      const regs = createRegisters('int64', 1, false)
      expect(regs).toHaveLength(4)
      expect(regs).toEqual([0, 0, 0, 1])
    })

    it('converts negative value', () => {
      const regs = createRegisters('int64', -1, false)
      expect(regs).toEqual([65535, 65535, 65535, 65535])
    })

    it('handles little endian word reversal', () => {
      const be = createRegisters('int64', 1, false)
      const le = createRegisters('int64', 1, true)
      // LE reverses all 4 words
      expect(le[0]).toBe(be[3])
      expect(le[1]).toBe(be[2])
      expect(le[2]).toBe(be[1])
      expect(le[3]).toBe(be[0])
    })
  })

  describe('uint64', () => {
    it('converts to 4 registers', () => {
      expect(createRegisters('uint64', 0, false)).toEqual([0, 0, 0, 0])
      expect(createRegisters('uint64', 1, false)).toEqual([0, 0, 0, 1])
    })

    it('applies little endian word swap', () => {
      const be = createRegisters('uint64', 1, false)
      const le = createRegisters('uint64', 1, true)
      expect(le).toEqual([be[3], be[2], be[1], be[0]])
    })
  })

  describe('double', () => {
    it('converts 1.0 to 4 registers', () => {
      const regs = createRegisters('double', 1.0, false)
      expect(regs).toHaveLength(4)
      // IEEE 754 double: 1.0 = 0x3FF0000000000000
      // → [0x3FF0, 0x0000, 0x0000, 0x0000]
      expect(regs[0]).toBe(0x3ff0)
      expect(regs[1]).toBe(0)
      expect(regs[2]).toBe(0)
      expect(regs[3]).toBe(0)
    })

    it('handles little endian word reversal', () => {
      const be = createRegisters('double', 1.0, false)
      const le = createRegisters('double', 1.0, true)
      expect(le[0]).toBe(be[3])
      expect(le[1]).toBe(be[2])
      expect(le[2]).toBe(be[1])
      expect(le[3]).toBe(be[0])
    })
  })

  describe('round-trip consistency', () => {
    it('int32: value → registers → buffer → value', () => {
      const value = 123456
      const regs = createRegisters('int32', value, false)
      // Reconstruct buffer from registers
      const buf = Buffer.alloc(4)
      buf.writeUInt16BE(regs[0], 0)
      buf.writeUInt16BE(regs[1], 2)
      expect(buf.readInt32BE(0)).toBe(value)
    })

    it('float: value → registers → buffer → value', () => {
      const value = 3.14
      const regs = createRegisters('float', value, false)
      const buf = Buffer.alloc(4)
      buf.writeUInt16BE(regs[0], 0)
      buf.writeUInt16BE(regs[1], 2)
      expect(buf.readFloatBE(0)).toBeCloseTo(value, 2)
    })

    it('double: value → registers → buffer → value', () => {
      const value = 3.141592653589793
      const regs = createRegisters('double', value, false)
      const buf = Buffer.alloc(8)
      buf.writeUInt16BE(regs[0], 0)
      buf.writeUInt16BE(regs[1], 2)
      buf.writeUInt16BE(regs[2], 4)
      buf.writeUInt16BE(regs[3], 6)
      expect(buf.readDoubleBE(0)).toBeCloseTo(value, 10)
    })

    it('uint32 little endian: value → registers → swapped buffer → value', () => {
      const value = 70000
      const regs = createRegisters('uint32', value, true)
      // LE registers need to be swapped back to read
      const buf = Buffer.alloc(4)
      buf.writeUInt16BE(regs[0], 0)
      buf.writeUInt16BE(regs[1], 2)
      // Swap the two words back
      const swapped = littleEndian32(buf, 0)
      expect(swapped.readUInt32BE(0)).toBe(value)
    })
  })
})

// ---------------------------------------------------------------------------
// getMinMaxValues
// ---------------------------------------------------------------------------
describe('getMinMaxValues', () => {
  it('returns correct range for int16', () => {
    expect(getMinMaxValues('int16')).toEqual({ min: -32768, max: 32767 })
  })

  it('returns correct range for uint16', () => {
    expect(getMinMaxValues('uint16')).toEqual({ min: 0, max: 65535 })
  })

  it('returns correct range for int32', () => {
    expect(getMinMaxValues('int32')).toEqual({ min: -2147483648, max: 2147483647 })
  })

  it('returns correct range for uint32', () => {
    expect(getMinMaxValues('uint32')).toEqual({ min: 0, max: 4294967295 })
  })

  it('returns safe integer range for int64', () => {
    expect(getMinMaxValues('int64')).toEqual({
      min: Number.MIN_SAFE_INTEGER,
      max: Number.MAX_SAFE_INTEGER
    })
  })

  it('returns 0 to MAX_SAFE_INTEGER for uint64', () => {
    expect(getMinMaxValues('uint64')).toEqual({
      min: 0,
      max: Number.MAX_SAFE_INTEGER
    })
  })

  it('returns infinity range for float', () => {
    const { min, max } = getMinMaxValues('float')
    expect(min).toBe(Number.NEGATIVE_INFINITY)
    expect(max).toBe(Number.POSITIVE_INFINITY)
  })

  it('returns infinity range for double', () => {
    const { min, max } = getMinMaxValues('double')
    expect(min).toBe(Number.NEGATIVE_INFINITY)
    expect(max).toBe(Number.POSITIVE_INFINITY)
  })

  it('returns { min: 0, max: 0 } for unknown types', () => {
    expect(getMinMaxValues('none')).toEqual({ min: 0, max: 0 })
  })
})

// ---------------------------------------------------------------------------
// notEmpty
// ---------------------------------------------------------------------------
describe('notEmpty', () => {
  it('returns true for non-empty strings', () => {
    expect(notEmpty('hello')).toBe(true)
    expect(notEmpty('1')).toBe(true)
  })

  it('returns true for numbers', () => {
    expect(notEmpty(42)).toBe(true)
    expect(notEmpty(0)).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(notEmpty('')).toBe(false)
  })

  it('returns true for negative numbers (strips dash)', () => {
    expect(notEmpty(-5)).toBe(true)
  })

  it('returns false for just a minus sign', () => {
    expect(notEmpty('-')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// humanizeSerialError
// ---------------------------------------------------------------------------
describe('humanizeSerialError', () => {
  it('humanizes "file not found" errors', () => {
    const err = new Error('file not found')
    expect(humanizeSerialError(err)).toBe('Port not found or not available')
  })

  it('humanizes "access denied" errors', () => {
    const err = new Error('Access denied')
    expect(humanizeSerialError(err)).toBe('Port access denied (already in use?)')
  })

  it('humanizes "permission denied" errors', () => {
    const err = new Error('Permission denied')
    expect(humanizeSerialError(err)).toBe('Port access denied (already in use?)')
  })

  it('prepends port name when provided', () => {
    const err = new Error('file not found')
    expect(humanizeSerialError(err, 'COM3')).toBe('COM3: Port not found or not available')
  })

  it('prepends port name for access denied', () => {
    const err = new Error('access denied')
    expect(humanizeSerialError(err, '/dev/ttyUSB0')).toBe(
      '/dev/ttyUSB0: Port access denied (already in use?)'
    )
  })

  it('returns original message for unknown errors', () => {
    const err = new Error('Connection timeout')
    expect(humanizeSerialError(err)).toBe('Connection timeout')
  })

  it('returns original message for unknown errors even with port', () => {
    const err = new Error('Something went wrong')
    expect(humanizeSerialError(err, 'COM5')).toBe('Something went wrong')
  })
})

// ---------------------------------------------------------------------------
// default.ts exports
// ---------------------------------------------------------------------------
describe('dummyWords', () => {
  it('has zero/empty values for all data types', () => {
    expect(dummyWords).toEqual({
      int16: 0,
      uint16: 0,
      int32: 0,
      uint32: 0,
      unix: '',
      float: 0,
      int64: 0n,
      uint64: 0n,
      double: 0,
      datetime: '',
      utf8: ''
    })
  })
})

describe('getDummyRegisterData', () => {
  it('returns register data with the correct id', () => {
    const data = getDummyRegisterData(42)
    expect(data.id).toBe(42)
  })

  it('returns zeroed-out register data', () => {
    const data = getDummyRegisterData(0)
    expect(data.bit).toBe(false)
    expect(data.hex).toBe('0000')
    expect(data.buffer).toEqual(Buffer.from([0, 0]))
    expect(data.isScanned).toBe(false)
  })

  it('returns a fresh copy of dummyWords (not shared reference)', () => {
    const a = getDummyRegisterData(0)
    const b = getDummyRegisterData(1)
    expect(a.words).toEqual(b.words)
    expect(a.words).not.toBe(b.words)
  })

  // ! Coverage-only: duplicates dummyWords test above, just through the function
  it('contains all expected word fields', () => {
    const data = getDummyRegisterData(0)
    expect(data.words).toEqual({
      int16: 0,
      uint16: 0,
      int32: 0,
      uint32: 0,
      unix: '',
      float: 0,
      int64: 0n,
      uint64: 0n,
      double: 0,
      datetime: '',
      utf8: ''
    })
  })
})

describe('MAIN_SERVER_UUID', () => {
  // ! Coverage-only: validates format of a hardcoded constant
  it('is a valid UUID string', () => {
    expect(MAIN_SERVER_UUID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })
})

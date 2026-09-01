import { describe, it, expect } from 'vitest'
import { getRegisterSize, isAddressInUse } from '../addRegister.zustand.helpers'

// ─── getRegisterSize ────────────────────────────────────────────────

describe('getRegisterSize', () => {
  it('returns 1 for 16-bit types', () => {
    expect(getRegisterSize('int16')).toBe(1)
    expect(getRegisterSize('uint16')).toBe(1)
  })

  it('returns 2 for 32-bit types', () => {
    expect(getRegisterSize('int32')).toBe(2)
    expect(getRegisterSize('uint32')).toBe(2)
    expect(getRegisterSize('float')).toBe(2)
    expect(getRegisterSize('unix')).toBe(2)
  })

  it('returns 4 for 64-bit types', () => {
    expect(getRegisterSize('int64')).toBe(4)
    expect(getRegisterSize('uint64')).toBe(4)
    expect(getRegisterSize('double')).toBe(4)
    expect(getRegisterSize('datetime')).toBe(4)
  })

  it('returns provided length for utf8', () => {
    expect(getRegisterSize('utf8', 5)).toBe(5)
    expect(getRegisterSize('utf8', 124)).toBe(124)
  })

  it('defaults to 10 for utf8 without length', () => {
    expect(getRegisterSize('utf8')).toBe(10)
  })
})

// ─── isAddressInUse ─────────────────────────────────────────────────

describe('isAddressInUse', () => {
  it('returns false when no addresses are used', () => {
    expect(isAddressInUse([], 'int16', 0)).toBe(false)
  })

  it('returns true when exact address is used', () => {
    expect(isAddressInUse([5], 'int16', 5)).toBe(true)
  })

  it('returns false when address is not used', () => {
    expect(isAddressInUse([5], 'int16', 6)).toBe(false)
  })

  // Multi-register overlap
  it('detects overlap for int32 (2 registers)', () => {
    // INT32 at address 10 needs addresses 10, 11
    expect(isAddressInUse([11], 'int32', 10)).toBe(true)
    expect(isAddressInUse([10], 'int32', 10)).toBe(true)
    expect(isAddressInUse([12], 'int32', 10)).toBe(false)
  })

  it('detects overlap for int64 (4 registers)', () => {
    // INT64 at address 100 needs 100, 101, 102, 103
    expect(isAddressInUse([103], 'int64', 100)).toBe(true)
    expect(isAddressInUse([104], 'int64', 100)).toBe(false)
  })

  it('detects overlap for utf8 with custom length', () => {
    // UTF-8 with length 3 at address 50 needs 50, 51, 52
    expect(isAddressInUse([52], 'utf8', 50, 3)).toBe(true)
    expect(isAddressInUse([53], 'utf8', 50, 3)).toBe(false)
  })

  // Edit mode — exclude current register's addresses
  it('excludes edit register addresses in edit mode', () => {
    // Address 10 is used, but we're editing the register at 10
    const used = [10]
    const edit = { dataType: 'int16' as const, address: 10 }
    expect(isAddressInUse(used, 'int16', 10, undefined, edit)).toBe(false)
  })

  it('excludes multi-register edit addresses', () => {
    // Addresses 10, 11 used by INT32, editing that same register
    const used = [10, 11]
    const edit = { dataType: 'int32' as const, address: 10 }
    expect(isAddressInUse(used, 'int32', 10, undefined, edit)).toBe(false)
  })

  it('detects conflict even in edit mode when moving to occupied address', () => {
    // Addresses 10, 11 (INT32 being edited) and 20 (another register)
    const used = [10, 11, 20]
    const edit = { dataType: 'int32' as const, address: 10 }
    // Moving to address 20 should conflict
    expect(isAddressInUse(used, 'int16', 20, undefined, edit)).toBe(true)
  })

  it('allows moving edit register to a free address', () => {
    const used = [10, 11]
    const edit = { dataType: 'int32' as const, address: 10 }
    // Moving to address 50 is fine
    expect(isAddressInUse(used, 'int32', 50, undefined, edit)).toBe(false)
  })

  it('handles edit register with utf8 length', () => {
    // UTF-8 register at address 0 with length 5 occupies 0-4
    const used = [0, 1, 2, 3, 4, 10]
    const edit = { dataType: 'utf8' as const, address: 0, length: 5 }
    // Changing to address 0 with same size should be fine (it's the same register)
    expect(isAddressInUse(used, 'utf8', 0, 5, edit)).toBe(false)
    // But address 10 is still occupied by another register
    expect(isAddressInUse(used, 'int16', 10, undefined, edit)).toBe(true)
  })

  // Edge cases
  it('handles empty used addresses with edit register', () => {
    const edit = { dataType: 'int16' as const, address: 5 }
    expect(isAddressInUse([], 'int16', 0, undefined, edit)).toBe(false)
  })

  it('handles address at boundary (65535)', () => {
    expect(isAddressInUse([], 'int16', 65535)).toBe(false)
    expect(isAddressInUse([65535], 'int16', 65535)).toBe(true)
  })

  it('detects partial overlap when expanding data type in edit mode', () => {
    // INT16 at address 10 being edited, but address 11 is used by another register
    const used = [10, 11]
    const edit = { dataType: 'int16' as const, address: 10 }
    // Changing to INT32 at address 10 needs 10+11, but 11 belongs to another register
    expect(isAddressInUse(used, 'int32', 10, undefined, edit)).toBe(true)
  })
})

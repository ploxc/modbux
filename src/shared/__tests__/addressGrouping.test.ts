import { describe, it, expect } from 'vitest'
import { getRegisterLength, buildAddrInfos, groupAddressInfos } from '../addressGrouping'
import type { RegisterMapObject } from '../types'

describe('getRegisterLength', () => {
  it('returns 1 for 16-bit types', () => {
    expect(getRegisterLength('int16', 0)).toBe(1)
    expect(getRegisterLength('uint16', 0)).toBe(1)
  })

  it('returns 2 for 32-bit types', () => {
    expect(getRegisterLength('int32', 0)).toBe(2)
    expect(getRegisterLength('uint32', 0)).toBe(2)
    expect(getRegisterLength('float', 0)).toBe(2)
    expect(getRegisterLength('unix', 0)).toBe(2)
  })

  it('returns 4 for 64-bit types', () => {
    expect(getRegisterLength('int64', 0)).toBe(4)
    expect(getRegisterLength('uint64', 0)).toBe(4)
    expect(getRegisterLength('double', 0)).toBe(4)
    expect(getRegisterLength('datetime', 0)).toBe(4)
  })

  it('returns 0 for unknown type', () => {
    expect(getRegisterLength('none', 0)).toBe(0)
  })

  describe('utf8', () => {
    it('returns gap when next address is known and smaller than default', () => {
      expect(getRegisterLength('utf8', 10, 20)).toBe(10)
    })

    it('caps at DEFAULT_UTF8_REGISTERS when gap is larger', () => {
      expect(getRegisterLength('utf8', 0, 100)).toBe(24)
    })

    it('returns default when next address is not provided', () => {
      expect(getRegisterLength('utf8', 0)).toBe(24)
    })

    it('returns default when next address is not greater than current', () => {
      expect(getRegisterLength('utf8', 10, 10)).toBe(24)
      expect(getRegisterLength('utf8', 10, 5)).toBe(24)
    })
  })
})

describe('buildAddrInfos', () => {
  it('builds info entries from register map entries', () => {
    const items: [string, { dataType?: string; groupEnd?: boolean }][] = [
      ['0', { dataType: 'uint16' }],
      ['10', { dataType: 'int32' }],
      ['20', { dataType: 'double' }]
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const infos = buildAddrInfos(items as any)

    expect(infos).toEqual([
      { address: 0, registerCount: 1, groupEnd: false },
      { address: 10, registerCount: 2, groupEnd: false },
      { address: 20, registerCount: 4, groupEnd: false }
    ])
  })

  it('skips entries with dataType none', () => {
    const items: [string, { dataType?: string }][] = [
      ['0', { dataType: 'none' }],
      ['5', { dataType: 'uint16' }]
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const infos = buildAddrInfos(items as any)
    expect(infos).toHaveLength(1)
    expect(infos[0].address).toBe(5)
  })

  it('skips entries with undefined dataType', () => {
    const items: [string, { dataType?: string }][] = [
      ['0', {}],
      ['5', { dataType: 'uint16' }]
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const infos = buildAddrInfos(items as any)
    expect(infos).toHaveLength(1)
  })

  it('preserves groupEnd flag', () => {
    const items: [string, { dataType?: string; groupEnd?: boolean }][] = [
      ['0', { dataType: 'uint16', groupEnd: true }],
      ['5', { dataType: 'uint16' }]
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const infos = buildAddrInfos(items as any)
    expect(infos[0].groupEnd).toBe(true)
    expect(infos[1].groupEnd).toBe(false)
  })

  it('uses next address for utf8 gap calculation', () => {
    const items: [string, { dataType?: string }][] = [
      ['0', { dataType: 'utf8' }],
      ['10', { dataType: 'uint16' }]
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const infos = buildAddrInfos(items as any)
    expect(infos[0].registerCount).toBe(10) // gap = 10 - 0
  })
})

describe('groupAddressInfos', () => {
  it('returns empty array for undefined registers', () => {
    expect(groupAddressInfos(undefined)).toEqual([])
  })

  it('returns empty array for empty registers', () => {
    expect(groupAddressInfos({})).toEqual([])
  })

  it('groups a single register', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'uint16' }
    }

    const groups = groupAddressInfos(registers)
    expect(groups).toEqual([[0, 1]])
  })

  it('groups adjacent registers into a single block', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'uint16' },
      1: { dataType: 'uint16' },
      2: { dataType: 'uint16' }
    }

    const groups = groupAddressInfos(registers)
    expect(groups).toEqual([[0, 3]])
  })

  it('groups registers with gaps within maxLength', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'uint16' },
      50: { dataType: 'uint16' }
    }

    const groups = groupAddressInfos(registers)
    // 0..50 = 51 registers, within default maxLength of 100
    expect(groups).toEqual([[0, 51]])
  })

  it('splits groups that exceed maxLength', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'uint16' },
      200: { dataType: 'uint16' }
    }

    const groups = groupAddressInfos(registers)
    // Gap is 201 registers, exceeds default maxLength of 100
    expect(groups).toEqual([
      [0, 1],
      [200, 1]
    ])
  })

  it('respects custom maxLength', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'uint16' },
      20: { dataType: 'uint16' }
    }

    const groups = groupAddressInfos(registers, 10)
    // Gap is 21, exceeds maxLength of 10
    expect(groups).toEqual([
      [0, 1],
      [20, 1]
    ])
  })

  it('respects groupEnd flag', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'uint16', groupEnd: true },
      1: { dataType: 'uint16' },
      2: { dataType: 'uint16' }
    }

    const groups = groupAddressInfos(registers)
    expect(groups).toEqual([
      [0, 1],
      [1, 2]
    ])
  })

  it('accounts for multi-register data types', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'int32' }, // 2 registers: 0-1
      2: { dataType: 'int32' } // 2 registers: 2-3
    }

    const groups = groupAddressInfos(registers)
    // 0..3 = 4 registers
    expect(groups).toEqual([[0, 4]])
  })

  it('accounts for 64-bit data types', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'double' }, // 4 registers: 0-3
      10: { dataType: 'double' } // 4 registers: 10-13
    }

    const groups = groupAddressInfos(registers)
    // 0..13 = 14 registers, within maxLength
    expect(groups).toEqual([[0, 14]])
  })

  it('skips registers with dataType none', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'none' },
      5: { dataType: 'uint16' }
    }

    const groups = groupAddressInfos(registers)
    expect(groups).toEqual([[5, 1]])
  })

  it('skips registers with undefined dataType', () => {
    const registers: RegisterMapObject = {
      0: {},
      5: { dataType: 'uint16' }
    }

    const groups = groupAddressInfos(registers)
    expect(groups).toEqual([[5, 1]])
  })

  it('handles multiple separate groups', () => {
    const registers: RegisterMapObject = {
      0: { dataType: 'uint16' },
      5: { dataType: 'uint16' },
      200: { dataType: 'uint16' },
      205: { dataType: 'uint16' }
    }

    const groups = groupAddressInfos(registers)
    // Group 1: 0..5 = 6 registers
    // Group 2: 200..205 = 6 registers
    // Gap between groups is too large for maxLength=100
    expect(groups).toEqual([
      [0, 6],
      [200, 6]
    ])
  })
})

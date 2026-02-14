import { describe, it, expect } from 'vitest'
import {
  findAvailablePort,
  getUsedAddresses,
  checkHasConfig,
  getAddressFitError,
  snakeToCamel
} from '../utils'
import type { RegisterParams, ServerRegisters } from '../types'

// ─── snakeToCamel ────────────────────────────────────────────────────

describe('snakeToCamel', () => {
  it('converts snake_case to camelCase', () => {
    expect(snakeToCamel('get_connection_config')).toBe('getConnectionConfig')
  })

  it('returns single word unchanged', () => {
    expect(snakeToCamel('connect')).toBe('connect')
  })

  it('handles multiple underscores', () => {
    expect(snakeToCamel('stop_scanning_unit_ids')).toBe('stopScanningUnitIds')
  })

  it('handles two-part names', () => {
    expect(snakeToCamel('start_polling')).toBe('startPolling')
  })

  it('converts all IPC_CHANNELS correctly', () => {
    const cases: [string, string][] = [
      ['update_register_config', 'updateRegisterConfig'],
      ['scan_unit_ids', 'scanUnitIds'],
      ['add_replace_server_register', 'addReplaceServerRegister'],
      ['set_bool', 'setBool'],
      ['get_app_version', 'getAppVersion'],
      ['list_serial_ports', 'listSerialPorts'],
      ['validate_serial_port', 'validateSerialPort']
    ]
    for (const [input, expected] of cases) {
      expect(snakeToCamel(input)).toBe(expected)
    }
  })
})

// ─── findAvailablePort ───────────────────────────────────────────────

describe('findAvailablePort', () => {
  it('returns 502 when no ports are in use', () => {
    expect(findAvailablePort([])).toBe(502)
  })

  it('returns next port after the highest used port', () => {
    expect(findAvailablePort([502])).toBe(503)
    expect(findAvailablePort([502, 503, 504])).toBe(505)
  })

  it('returns the first gap when ports are non-sequential', () => {
    expect(findAvailablePort([502, 504])).toBe(505)
  })

  it('wraps around when high ports are taken but low ports are free', () => {
    expect(findAvailablePort([999, 1000])).toBe(502)
  })

  it('returns undefined when all ports 502-1000 are taken', () => {
    const allPorts = Array.from({ length: 499 }, (_, i) => 502 + i)
    expect(findAvailablePort(allPorts)).toBeUndefined()
  })

  it('handles ports below the valid range', () => {
    expect(findAvailablePort([100, 200])).toBe(502)
  })

  it('clamps start to MAX_PORT when used ports exceed range', () => {
    expect(findAvailablePort([2000, 3000])).toBe(1000)
  })
})

// ─── getUsedAddresses ────────────────────────────────────────────────

describe('getUsedAddresses', () => {
  const makeRegister = (address: number, dataType: string): RegisterParams =>
    ({
      address,
      dataType,
      registerType: 'holding_registers',
      littleEndian: false,
      comment: '',
      value: 0
    }) as RegisterParams

  it('returns empty array for empty input', () => {
    expect(getUsedAddresses([])).toEqual([])
  })

  it('returns single address for int16/uint16', () => {
    expect(getUsedAddresses([makeRegister(10, 'int16')])).toEqual([10])
    expect(getUsedAddresses([makeRegister(20, 'uint16')])).toEqual([20])
  })

  it('returns 2 addresses for int32/uint32/float', () => {
    const result = getUsedAddresses([makeRegister(10, 'int32')])
    expect(result.sort()).toEqual([10, 11])

    const result2 = getUsedAddresses([makeRegister(5, 'float')])
    expect(result2.sort()).toEqual([5, 6])
  })

  it('returns 4 addresses for int64/uint64/double', () => {
    const result = getUsedAddresses([makeRegister(100, 'int64')])
    expect(result.sort()).toEqual([100, 101, 102, 103])

    const result2 = getUsedAddresses([makeRegister(0, 'double')])
    expect(result2.sort()).toEqual([0, 1, 2, 3])
  })

  it('deduplicates overlapping addresses from multiple registers', () => {
    const result = getUsedAddresses([
      makeRegister(10, 'int32'), // 10, 11
      makeRegister(11, 'int16') // 11
    ])
    expect(result.sort()).toEqual([10, 11])
  })

  it('handles multiple registers of different types', () => {
    const result = getUsedAddresses([
      makeRegister(0, 'uint16'), // 0
      makeRegister(1, 'float'), // 1, 2
      makeRegister(10, 'double') // 10, 11, 12, 13
    ])
    expect(result.sort((a, b) => a - b)).toEqual([0, 1, 2, 10, 11, 12, 13])
  })
})

// ─── checkHasConfig ──────────────────────────────────────────────────

describe('checkHasConfig', () => {
  const emptyRegisters: ServerRegisters = {
    coils: {},
    discrete_inputs: {},
    input_registers: {},
    holding_registers: {}
  }

  it('returns false for empty registers', () => {
    expect(checkHasConfig(emptyRegisters)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(checkHasConfig(undefined)).toBe(false)
  })

  it('returns true when coils have truthy values', () => {
    expect(checkHasConfig({ ...emptyRegisters, coils: { '0': true } })).toBe(true)
  })

  it('returns false when coils only have falsy values', () => {
    expect(checkHasConfig({ ...emptyRegisters, coils: { '0': false } })).toBe(false)
  })

  it('returns true when discrete_inputs have truthy values', () => {
    expect(checkHasConfig({ ...emptyRegisters, discrete_inputs: { '0': true } })).toBe(true)
  })

  it('returns true when input_registers has entries', () => {
    const regs = {
      ...emptyRegisters,
      input_registers: {
        '0': {
          value: 42,
          params: {
            address: 0,
            registerType: 'input_registers' as const,
            dataType: 'int16' as const,
            littleEndian: false,
            comment: '',
            value: 42
          }
        }
      }
    }
    expect(checkHasConfig(regs)).toBe(true)
  })

  it('returns true when holding_registers has entries', () => {
    const regs = {
      ...emptyRegisters,
      holding_registers: {
        '0': {
          value: 0,
          params: {
            address: 0,
            registerType: 'holding_registers' as const,
            dataType: 'int16' as const,
            littleEndian: false,
            comment: '',
            value: 0
          }
        }
      }
    }
    expect(checkHasConfig(regs)).toBe(true)
  })
})

// ─── getAddressFitError ──────────────────────────────────────────────

describe('getAddressFitError', () => {
  it('returns false for int16 at address 65535 (fits)', () => {
    expect(getAddressFitError('int16', 65535)).toBe(false)
  })

  it('returns false for int16 at address 0', () => {
    expect(getAddressFitError('int16', 0)).toBe(false)
  })

  it('returns true for int32 at address 65535 (overflows)', () => {
    expect(getAddressFitError('int32', 65535)).toBe(true)
  })

  it('returns false for int32 at address 65534 (fits exactly)', () => {
    expect(getAddressFitError('int32', 65534)).toBe(false)
  })

  it('returns true for float at address 65535 (overflows)', () => {
    expect(getAddressFitError('float', 65535)).toBe(true)
  })

  it('returns true for double at address 65533 (overflows by 1)', () => {
    expect(getAddressFitError('double', 65533)).toBe(true)
  })

  it('returns false for double at address 65532 (fits exactly)', () => {
    expect(getAddressFitError('double', 65532)).toBe(false)
  })

  it('returns true for int64 at address 65534', () => {
    expect(getAddressFitError('int64', 65534)).toBe(true)
  })

  it('returns false for uint64 at address 65532', () => {
    expect(getAddressFitError('uint64', 65532)).toBe(false)
  })
})

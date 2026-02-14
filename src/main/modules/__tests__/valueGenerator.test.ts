import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ValueGenerator } from '../modbusServer/valueGenerator'
import type { ServerData, UnitIdString, Windows } from '@shared'

const createMockWindows = (): Windows => ({ send: vi.fn() }) as unknown as Windows

const createServerData = (): ServerData => ({
  coils: new Array(65535).fill(false),
  discrete_inputs: new Array(65535).fill(false),
  input_registers: new Array(65535).fill(0),
  holding_registers: new Array(65535).fill(0)
})

describe('ValueGenerator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets an initial value on construction', () => {
    const windows = createMockWindows()
    const serverData = createServerData()

    const gen = new ValueGenerator({
      uuid: 'test-uuid',
      unitId: '1' as UnitIdString,
      windows,
      serverData,
      registerType: 'holding_registers',
      address: 0,
      dataType: 'uint16',
      min: 100,
      max: 100, // fixed value: min === max
      littleEndian: false,
      interval: 1000,
      comment: 'test'
    })

    // With min === max === 100, the value should be 100
    expect(serverData.holding_registers[0]).toBe(100)
    expect(windows.send).toHaveBeenCalledWith(
      'register_value',
      expect.objectContaining({
        uuid: 'test-uuid',
        unitId: '1',
        registerType: 'holding_registers',
        address: 0
      })
    )

    gen.dispose()
  })

  it('updates value on interval tick', () => {
    const windows = createMockWindows()
    const serverData = createServerData()

    const gen = new ValueGenerator({
      uuid: 'test-uuid',
      unitId: '1' as UnitIdString,
      windows,
      serverData,
      registerType: 'holding_registers',
      address: 10,
      dataType: 'uint16',
      min: 50,
      max: 50,
      littleEndian: false,
      interval: 2000,
      comment: ''
    })

    // Initial call
    expect(windows.send).toHaveBeenCalledTimes(1)

    // Advance by one interval
    vi.advanceTimersByTime(2000)
    expect(windows.send).toHaveBeenCalledTimes(2)

    // Advance by another interval
    vi.advanceTimersByTime(2000)
    expect(windows.send).toHaveBeenCalledTimes(3)

    gen.dispose()
  })

  it('writes multiple registers for 32-bit types', () => {
    const windows = createMockWindows()
    const serverData = createServerData()

    const gen = new ValueGenerator({
      uuid: 'test-uuid',
      unitId: '1' as UnitIdString,
      windows,
      serverData,
      registerType: 'holding_registers',
      address: 0,
      dataType: 'int32',
      min: 70000,
      max: 70000,
      littleEndian: false,
      interval: 1000,
      comment: ''
    })

    // int32 takes 2 registers
    // 70000 = 0x00011170 → [1, 4464]
    expect(serverData.holding_registers[0]).toBe(1)
    expect(serverData.holding_registers[1]).toBe(4464)

    // Should have sent 2 register_value events (one per register)
    expect(windows.send).toHaveBeenCalledTimes(2)

    gen.dispose()
  })

  it('writes 4 registers for 64-bit types', () => {
    const windows = createMockWindows()
    const serverData = createServerData()

    const gen = new ValueGenerator({
      uuid: 'test-uuid',
      unitId: '1' as UnitIdString,
      windows,
      serverData,
      registerType: 'input_registers',
      address: 100,
      dataType: 'double',
      min: 1.0,
      max: 1.0,
      littleEndian: false,
      interval: 1000,
      comment: ''
    })

    // double 1.0 = 4 registers
    expect(windows.send).toHaveBeenCalledTimes(4)

    gen.dispose()
  })

  it('generates values within min/max range', () => {
    const windows = createMockWindows()
    const serverData = createServerData()

    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const gen = new ValueGenerator({
      uuid: 'test-uuid',
      unitId: '1' as UnitIdString,
      windows,
      serverData,
      registerType: 'holding_registers',
      address: 0,
      dataType: 'uint16',
      min: 0,
      max: 100,
      littleEndian: false,
      interval: 1000,
      comment: ''
    })

    // Math.random() = 0.5 → round(0.5 * (100 - 0) + 0, 0) = 50
    expect(serverData.holding_registers[0]).toBe(50)

    gen.dispose()
    vi.spyOn(Math, 'random').mockRestore()
  })

  it('uses 2 decimals for float type', () => {
    const windows = createMockWindows()
    const serverData = createServerData()

    vi.spyOn(Math, 'random').mockReturnValue(0.33333)

    const gen = new ValueGenerator({
      uuid: 'test-uuid',
      unitId: '1' as UnitIdString,
      windows,
      serverData,
      registerType: 'holding_registers',
      address: 0,
      dataType: 'float',
      min: 0,
      max: 100,
      littleEndian: false,
      interval: 1000,
      comment: ''
    })

    // Math.random() = 0.33333 → round(0.33333 * 100, 2) = 33.33
    // float 33.33 is written as 2 registers
    // Verify the value by reading it back from the registers
    const buf = Buffer.alloc(4)
    buf.writeUInt16BE(serverData.holding_registers[0], 0)
    buf.writeUInt16BE(serverData.holding_registers[1], 2)
    const readBack = buf.readFloatBE(0)
    expect(readBack).toBeCloseTo(33.33, 1)

    gen.dispose()
    vi.spyOn(Math, 'random').mockRestore()
  })

  describe('dispose', () => {
    it('stops the interval timer', () => {
      const windows = createMockWindows()
      const serverData = createServerData()

      const gen = new ValueGenerator({
        uuid: 'test-uuid',
        unitId: '1' as UnitIdString,
        windows,
        serverData,
        registerType: 'holding_registers',
        address: 0,
        dataType: 'uint16',
        min: 50,
        max: 50,
        littleEndian: false,
        interval: 1000,
        comment: ''
      })

      const callsBefore = (windows.send as ReturnType<typeof vi.fn>).mock.calls.length

      gen.dispose()

      // Advance time — no more calls should happen
      vi.advanceTimersByTime(5000)
      expect(windows.send).toHaveBeenCalledTimes(callsBefore)
    })

    it('resets 1 register for 16-bit types', () => {
      const windows = createMockWindows()
      const serverData = createServerData()

      const gen = new ValueGenerator({
        uuid: 'test-uuid',
        unitId: '1' as UnitIdString,
        windows,
        serverData,
        registerType: 'holding_registers',
        address: 5,
        dataType: 'uint16',
        min: 100,
        max: 100,
        littleEndian: false,
        interval: 1000,
        comment: ''
      })

      expect(serverData.holding_registers[5]).toBe(100)
      gen.dispose()
      expect(serverData.holding_registers[5]).toBe(0)
    })

    it('resets 2 registers for 32-bit types', () => {
      const windows = createMockWindows()
      const serverData = createServerData()

      const gen = new ValueGenerator({
        uuid: 'test-uuid',
        unitId: '1' as UnitIdString,
        windows,
        serverData,
        registerType: 'holding_registers',
        address: 10,
        dataType: 'int32',
        min: 70000,
        max: 70000,
        littleEndian: false,
        interval: 1000,
        comment: ''
      })

      expect(serverData.holding_registers[10]).not.toBe(0)
      expect(serverData.holding_registers[11]).not.toBe(0)

      gen.dispose()
      expect(serverData.holding_registers[10]).toBe(0)
      expect(serverData.holding_registers[11]).toBe(0)
    })

    it('resets 4 registers for 64-bit types', () => {
      const windows = createMockWindows()
      const serverData = createServerData()

      const gen = new ValueGenerator({
        uuid: 'test-uuid',
        unitId: '1' as UnitIdString,
        windows,
        serverData,
        registerType: 'holding_registers',
        address: 20,
        dataType: 'double',
        min: 1.0,
        max: 1.0,
        littleEndian: false,
        interval: 1000,
        comment: ''
      })

      gen.dispose()
      expect(serverData.holding_registers[20]).toBe(0)
      expect(serverData.holding_registers[21]).toBe(0)
      expect(serverData.holding_registers[22]).toBe(0)
      expect(serverData.holding_registers[23]).toBe(0)
    })
  })

  describe('params getter', () => {
    it('returns the original configuration', () => {
      const windows = createMockWindows()
      const serverData = createServerData()

      const gen = new ValueGenerator({
        uuid: 'test-uuid',
        unitId: '1' as UnitIdString,
        windows,
        serverData,
        registerType: 'holding_registers',
        address: 42,
        dataType: 'float',
        min: -10,
        max: 10,
        littleEndian: true,
        interval: 5000,
        comment: 'temperature'
      })

      expect(gen.params).toEqual({
        address: 42,
        registerType: 'holding_registers',
        dataType: 'float',
        min: -10,
        max: 10,
        interval: 5000,
        littleEndian: true,
        comment: 'temperature'
      })

      gen.dispose()
    })
  })
})

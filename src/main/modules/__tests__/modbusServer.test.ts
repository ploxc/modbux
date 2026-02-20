/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { UnitIdString, Windows } from '@shared'
import type { IServiceVector } from 'modbus-serial/ServerTCP'

// Configurable port availability for net mock
let portAvailableResults: boolean[] = []

// Mock modbus-serial before importing ModbusServer
vi.mock('modbus-serial', () => ({
  // Must use `function` (not arrow) so it can be called with `new`
  ServerTCP: vi.fn().mockImplementation(function () {
    return { close: vi.fn((cb: (err: Error | null) => void) => cb(null)) }
  })
}))

// Mock net — fires events synchronously in listen() for fake timer compatibility
vi.mock('net', () => ({
  default: {
    createServer: vi.fn(() => {
      const handlers: Record<string, (...args: unknown[]) => void> = {}
      return {
        once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler
        }),
        listen: vi.fn(() => {
          const available = portAvailableResults.length > 0 ? portAvailableResults.shift()! : true
          if (available && handlers['listening']) {
            handlers['listening']()
          } else if (handlers['error']) {
            handlers['error']()
          }
        }),
        close: vi.fn((cb: () => void) => cb())
      }
    })
  }
}))

import { ModbusServer, SERVER_DEVICE_FAILURE, ILLEGAL_DATA_ADDRESS } from '../mobusServer'
import { ServerTCP } from 'modbus-serial'

const createMockWindows = (): Windows => ({ send: vi.fn() }) as unknown as Windows

describe('ModbusServer', () => {
  let server: ModbusServer
  let windows: Windows
  const uuid = 'test-server-uuid'
  const unitId: UnitIdString = '1'

  beforeEach(() => {
    vi.useFakeTimers()
    portAvailableResults = []
    vi.mocked(ServerTCP).mockClear()
    windows = createMockWindows()
    server = new ModbusServer({ windows })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const getWindowCalls = (event: string) =>
    (windows.send as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === event)

  describe('addRegister with static value', () => {
    it('writes a uint16 value to the correct address', () => {
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: 'test register',
          value: 1234,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      // Should send register_value event
      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({
          uuid,
          unitId,
          registerType: 'holding_registers',
          address: 0,
          raw: 1234
        })
      )
    })

    it('writes a 32-bit value across 2 registers', () => {
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 10,
          registerType: 'holding_registers',
          dataType: 'int32',
          comment: '',
          value: 70000,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      // 70000 = 0x00011170 → 2 register_value events
      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({
          address: 10,
          raw: 1 // high word
        })
      )
      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({
          address: 11,
          raw: 4464 // low word (0x1170)
        })
      )
    })

    it('writes to input_registers', () => {
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 5,
          registerType: 'input_registers',
          dataType: 'uint16',
          comment: '',
          value: 999,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({
          registerType: 'input_registers',
          address: 5,
          raw: 999
        })
      )
    })
  })

  describe('addRegister with value generator', () => {
    it('creates a generator that produces values', () => {
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: '',
          value: undefined,
          min: 50,
          max: 50,
          interval: 1000
        }
      })

      // Generator fires on construction
      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({
          address: 0,
          raw: 50
        })
      )
    })

    it('replaces existing generator at the same address', () => {
      // Add first generator
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',

          comment: '',
          value: undefined,
          min: 10,
          max: 10,
          interval: 1000
        }
      })

      const callsAfterFirst = (windows.send as ReturnType<typeof vi.fn>).mock.calls.length

      // Replace with new generator
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: '',
          value: undefined,
          min: 99,
          max: 99,
          interval: 1000
        }
      })

      // New generator should fire
      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({
          address: 0,
          raw: 99
        })
      )

      // Old generator should be disposed (no more ticks from it)
      vi.advanceTimersByTime(3000)
      // Only the new generator should produce values
      const allCalls = (windows.send as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === 'register_value' && call[1].address === 0
      )
      const valuesAfterReplace = allCalls.slice(callsAfterFirst).map((call) => call[1].raw)
      // All values should be 99 (from new generator), not 10
      expect(valuesAfterReplace.every((v: number) => v === 99)).toBe(true)
    })
  })

  describe('removeRegister', () => {
    it('resets register value to 0', () => {
      // First add a static value
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 5,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: '',
          value: 42,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      server.removeRegister({
        uuid,
        unitId,
        registerType: 'holding_registers',
        address: 5,
        dataType: 'uint16'
      })

      // No error should occur
    })

    it('disposes generator when removing', () => {
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: '',
          value: undefined,
          min: 50,
          max: 50,
          interval: 1000
        }
      })

      const callsBefore = (windows.send as ReturnType<typeof vi.fn>).mock.calls.length

      server.removeRegister({
        uuid,
        unitId,
        registerType: 'holding_registers',
        address: 0,
        dataType: 'uint16'
      })

      // After removal, advancing time should not produce new values
      vi.advanceTimersByTime(5000)
      const callsAfterRemoval = (windows.send as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[0] === 'register_value' && c[1].address === 0
      )
      expect(callsAfterRemoval.length).toBe(callsBefore)
    })

    it('handles removing when no generators exist for the unitId', () => {
      server.removeRegister({
        uuid,
        unitId,
        registerType: 'holding_registers',
        address: 0,
        dataType: 'uint16'
      })
      // Should not throw
    })

    it('resets all registers occupied by a multi-register type (int32)', async () => {
      await server.createServer({ uuid, port: 5020 })
      const vector = vi.mocked(ServerTCP).mock.calls.at(-1)![0]

      // Add int32 at address 0 — occupies addresses 0 and 1
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'int32',
          comment: '',
          value: 70000, // 0x00011170 → addr 0 = 1, addr 1 = 4464
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      // Verify both registers are set
      const cb0 = vi.fn()
      await vector.getHoldingRegister!(0, 1, cb0)
      expect(cb0).toHaveBeenCalledWith(null, 1) // high word

      const cb1 = vi.fn()
      await vector.getHoldingRegister!(1, 1, cb1)
      expect(cb1).toHaveBeenCalledWith(null, 4464) // low word

      // Remove the register
      server.removeRegister({
        uuid,
        unitId,
        registerType: 'holding_registers',
        address: 0,
        dataType: 'int32'
      })

      // Both addresses should be reset to 0
      const cb0After = vi.fn()
      await vector.getHoldingRegister!(0, 1, cb0After)
      expect(cb0After).toHaveBeenCalledWith(null, 0)

      const cb1After = vi.fn()
      await vector.getHoldingRegister!(1, 1, cb1After)
      expect(cb1After).toHaveBeenCalledWith(null, 0)
    })

    it('resets all registers occupied by a 64-bit type (double)', async () => {
      await server.createServer({ uuid, port: 5020 })
      const vector = vi.mocked(ServerTCP).mock.calls.at(-1)![0]

      // Add double at address 0 — occupies addresses 0, 1, 2, 3
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'double',
          comment: '',
          value: 3.14,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      // Remove the register
      server.removeRegister({
        uuid,
        unitId,
        registerType: 'holding_registers',
        address: 0,
        dataType: 'double'
      })

      // All 4 addresses should be reset to 0
      for (let i = 0; i < 4; i++) {
        const cb = vi.fn()
        await vector.getHoldingRegister!(i, 1, cb)
        expect(cb).toHaveBeenCalledWith(null, 0)
      }
    })

    it('handles removing non-existent address from existing generators', () => {
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: '',
          value: undefined,
          min: 50,
          max: 50,
          interval: 1000
        }
      })

      server.removeRegister({
        uuid,
        unitId,
        registerType: 'holding_registers',
        address: 99,
        dataType: 'uint16'
      })
      // Should not throw — generator at address 0 is untouched
    })
  })

  describe('setBool', () => {
    it('sets a coil value and emits event', () => {
      server.setBool({
        uuid,
        unitId,
        registerType: 'coils',
        address: 10,
        state: true
      })

      expect(windows.send).toHaveBeenCalledWith('boolean_value', {
        uuid,
        unitId,
        registerType: 'coils',
        address: 10,
        value: true
      })
    })

    it('sets a discrete_input value', () => {
      server.setBool({
        uuid,
        unitId,
        registerType: 'discrete_inputs',
        address: 5,
        state: false
      })

      expect(windows.send).toHaveBeenCalledWith('boolean_value', {
        uuid,
        unitId,
        registerType: 'discrete_inputs',
        address: 5,
        value: false
      })
    })

    // ! Coverage-only: exercises FALSE branch of !perUnitMap.has(unitId) in setBool
    it('reuses existing unitId data when already populated', () => {
      // First call creates the unitId entry
      server.setBool({ uuid, unitId, registerType: 'coils', address: 0, state: true })
      // Second call with same uuid+unitId should reuse existing data
      server.setBool({ uuid, unitId, registerType: 'coils', address: 1, state: true })

      expect(windows.send).toHaveBeenCalledWith(
        'boolean_value',
        expect.objectContaining({ address: 1, value: true })
      )
    })
  })

  describe('resetBools', () => {
    it('resets all coils for a unit', () => {
      // Set a coil first
      server.setBool({
        uuid,
        unitId,
        registerType: 'coils',
        address: 0,
        state: true
      })

      server.resetBools({
        uuid,
        unitId,
        registerType: 'coils'
      })

      // No error should occur - coils are reset
    })

    // ! Coverage-only: exercises TRUE branch when unitId not in map
    it('creates default data when unitId has no existing data', () => {
      // Call resetBools directly without prior setBool — unitId not in map yet
      server.resetBools({
        uuid,
        unitId: '99' as UnitIdString,
        registerType: 'coils'
      })

      // Should not throw — creates default data and resets
    })
  })

  describe('syncBools', () => {
    it('syncs coil and discrete_input arrays', () => {
      server.syncBools({
        uuid,
        unitId,
        coils: [true, false, true],
        discrete_inputs: [false, true]
      })

      // Should not throw
    })

    // ! Coverage-only: exercises FALSE branch of !perUnitMap.has(unitId) in syncBools
    it('reuses existing unitId data when already populated', () => {
      // First create unitId data via setBool
      server.setBool({ uuid, unitId, registerType: 'coils', address: 0, state: true })
      // Now syncBools should find unitId already in map
      server.syncBools({
        uuid,
        unitId,
        coils: [false, true],
        discrete_inputs: [true]
      })

      // Should not throw — reuses existing data
    })
  })

  describe('resetRegisters', () => {
    // ! Coverage-only: exercises FALSE branch of if (serverGenerators) in resetRegisters
    it('resets registers when no generators exist for the unitId', () => {
      // Call resetRegisters without adding any generators first
      server.resetRegisters({
        uuid,
        unitId: '42' as UnitIdString,
        registerType: 'holding_registers'
      })

      // Should not throw — skips generator disposal when none exist
    })

    it('resets all holding registers and disposes generators', () => {
      // Add a generator
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',

          comment: '',
          value: undefined,
          min: 1,
          max: 1,
          interval: 500
        }
      })

      server.resetRegisters({
        uuid,
        unitId,
        registerType: 'holding_registers'
      })

      const callsAfterReset = (windows.send as ReturnType<typeof vi.fn>).mock.calls.length

      // Generator should be disposed — no more ticks
      vi.advanceTimersByTime(3000)
      const callsAfterWait = (windows.send as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[0] === 'register_value'
      )
      // All register_value calls should be from before the reset
      expect(callsAfterWait.length).toBeLessThanOrEqual(callsAfterReset)
    })
  })

  describe('syncServerRegisters', () => {
    it('clears existing registers and adds new ones', () => {
      // Add initial register
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',

          comment: '',
          value: 100,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      // Sync with new values
      server.syncServerRegisters({
        uuid,
        unitId,
        littleEndian: false,
        registerValues: [
          {
            address: 10,
            registerType: 'holding_registers',
            dataType: 'uint16',

            comment: '',
            value: 200,
            min: undefined,
            max: undefined,
            interval: undefined
          }
        ]
      })

      // New register should be set
      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({
          address: 10,
          raw: 200
        })
      )
    })

    it('disposes existing generators before syncing', () => {
      // Add generators for both register types
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'input_registers',
          dataType: 'uint16',

          comment: '',
          value: undefined,
          min: 5,
          max: 5,
          interval: 500
        }
      })
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',

          comment: '',
          value: undefined,
          min: 10,
          max: 10,
          interval: 500
        }
      })

      server.syncServerRegisters({
        uuid,
        unitId,
        littleEndian: false,
        registerValues: []
      })

      const callsAfterSync = (windows.send as ReturnType<typeof vi.fn>).mock.calls.length
      vi.advanceTimersByTime(3000)
      const newRegisterCalls = (windows.send as ReturnType<typeof vi.fn>).mock.calls
        .slice(callsAfterSync)
        .filter((c) => c[0] === 'register_value')
      expect(newRegisterCalls.length).toBe(0)
    })

    // ! Coverage-only: exercises FALSE branch of if (unitIdGenerators) in syncServerRegisters
    it('skips generator cleanup when no generators exist for the uuid', () => {
      // Call syncServerRegisters without any prior addRegister
      server.syncServerRegisters({
        uuid: 'fresh-uuid',
        unitId,
        littleEndian: false,
        registerValues: [
          {
            address: 0,
            registerType: 'holding_registers',
            dataType: 'uint16',

            comment: '',
            value: 42,
            min: undefined,
            max: undefined,
            interval: undefined
          }
        ]
      })

      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({ address: 0, raw: 42 })
      )
    })

    // ! Coverage-only: exercises FALSE branch of if (generators) in syncServerRegisters
    it('skips generator cleanup when unitId has no generators', () => {
      // Add a generator for unitId '1'
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',

          comment: '',
          value: undefined,
          min: 1,
          max: 1,
          interval: 500
        }
      })

      // Sync for a DIFFERENT unitId — generators map exists for uuid but not for '2'
      server.syncServerRegisters({
        uuid,
        unitId: '2' as UnitIdString,
        littleEndian: false,
        registerValues: [
          {
            address: 0,
            registerType: 'holding_registers',
            dataType: 'uint16',

            comment: '',
            value: 99,
            min: undefined,
            max: undefined,
            interval: undefined
          }
        ]
      })

      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({ unitId: '2', raw: 99 })
      )
    })
  })

  describe('multiple unitIds', () => {
    it('maintains separate data per unitId', () => {
      const unitId2: UnitIdString = '2'

      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',

          comment: '',
          value: 111,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      server.addRegister({
        uuid,
        unitId: unitId2,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',

          comment: '',
          value: 222,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      // Both values should be sent
      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({
          unitId: '1',
          raw: 111
        })
      )
      expect(windows.send).toHaveBeenCalledWith(
        'register_value',
        expect.objectContaining({
          unitId: '2',
          raw: 222
        })
      )
    })
  })

  describe('createServer', () => {
    it('creates a server on the specified port', async () => {
      const port = await server.createServer({ uuid, port: 5020 })
      expect(port).toBe(5020)
      expect(ServerTCP).toHaveBeenCalledWith(expect.any(Object), {
        host: '0.0.0.0',
        port: 5020
      })
    })

    // ! Coverage-only: exercises port ?? DEFAULT_MOBUS_PORT branch
    it('uses default port (502) when port is not provided', async () => {
      const port = await server.createServer({ uuid, port: undefined as unknown as number })
      expect(port).toBe(502)
      expect(ServerTCP).toHaveBeenCalledWith(expect.any(Object), {
        host: '0.0.0.0',
        port: 502
      })
    })

    it('increments port when first port is unavailable', async () => {
      portAvailableResults = [false, false, true]
      const port = await server.createServer({ uuid, port: 5020 })
      expect(port).toBe(5022)
    })

    it('closes existing server before recreating', async () => {
      await server.createServer({ uuid, port: 5020 })
      const firstInstance = vi.mocked(ServerTCP).mock.results[0].value

      await server.createServer({ uuid, port: 5021 })
      expect(firstInstance.close).toHaveBeenCalled()
    })

    it('emits error when closing existing server fails', async () => {
      await server.createServer({ uuid, port: 5020 })
      const firstInstance = vi.mocked(ServerTCP).mock.results[0].value
      firstInstance.close.mockImplementation((cb: (err: Error | null) => void) =>
        cb(new Error('close error'))
      )

      await server.createServer({ uuid, port: 5021 })
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Error closing server')).toBe(true)
    })

    it('throws when no port available after 100 attempts', async () => {
      portAvailableResults = new Array(100).fill(false)
      await expect(server.createServer({ uuid, port: 5020 })).rejects.toThrow(
        'No available port found'
      )
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'No available port found')).toBe(true)
    })
  })

  describe('deleteServer', () => {
    it('deletes an existing server', async () => {
      await server.createServer({ uuid, port: 5020 })
      await server.deleteServer(uuid)
      // Creating again should work without close call on old server
      vi.mocked(ServerTCP).mockClear()
      await server.createServer({ uuid, port: 5020 })
      // Only the new ServerTCP was created, no close on old
      expect(vi.mocked(ServerTCP).mock.results[0].value.close).not.toHaveBeenCalled()
    })

    it('emits error when server not found', async () => {
      await server.deleteServer('non-existent')
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message.includes('No server found'))).toBe(true)
    })

    it('emits error when close fails', async () => {
      await server.createServer({ uuid, port: 5020 })
      vi.mocked(ServerTCP).mock.results[0].value.close.mockImplementation(
        (cb: (err: Error | null) => void) => cb(new Error('close error'))
      )

      await server.deleteServer(uuid)
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Error closing server')).toBe(true)
    })
  })

  describe('resetServer', () => {
    it('disposes generators and recreates server on same port', async () => {
      await server.createServer({ uuid, port: 5020 })
      // Add generators for both register types so _disposeAllGenerators covers both forEach callbacks
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'input_registers',
          dataType: 'uint16',

          comment: '',
          value: undefined,
          min: 5,
          max: 5,
          interval: 1000
        }
      })
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',

          comment: '',
          value: undefined,
          min: 50,
          max: 50,
          interval: 1000
        }
      })

      const callsBefore = (windows.send as ReturnType<typeof vi.fn>).mock.calls.length
      await server.resetServer(uuid)

      // Generator should be disposed — no more ticks
      vi.advanceTimersByTime(5000)
      const newCalls = (windows.send as ReturnType<typeof vi.fn>).mock.calls
        .slice(callsBefore)
        .filter((c) => c[0] === 'register_value')
      expect(newCalls.length).toBe(0)

      // Server was recreated (ServerTCP called again)
      expect(vi.mocked(ServerTCP).mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('handles reset when no generators exist', async () => {
      await server.createServer({ uuid, port: 5020 })
      await server.resetServer(uuid)
      // Should not throw
    })

    it('skips server recreation when no port is stored', async () => {
      const callsBefore = vi.mocked(ServerTCP).mock.calls.length
      await server.resetServer('unknown-uuid')
      expect(vi.mocked(ServerTCP).mock.calls.length).toBe(callsBefore)
    })
  })

  describe('setPort', () => {
    it('delegates to createServer', async () => {
      const port = await server.setPort({ uuid, port: 5020 })
      expect(port).toBe(5020)
      expect(ServerTCP).toHaveBeenCalled()
    })
  })

  describe('vector methods', () => {
    let vector: IServiceVector

    beforeEach(async () => {
      await server.createServer({ uuid, port: 5020 })
      vector = vi.mocked(ServerTCP).mock.calls.at(-1)![0]
    })

    describe('getCoil', () => {
      it('returns coil value for valid address and unitId', async () => {
        server.setBool({ uuid, unitId, registerType: 'coils', address: 5, state: true })
        const cb = vi.fn()
        await vector.getCoil!(5, 1, cb)
        expect(cb).toHaveBeenCalledWith(null, true)
      })

      it('returns false for unset coil address', async () => {
        server.setBool({ uuid, unitId, registerType: 'coils', address: 0, state: false })
        const cb = vi.fn()
        await vector.getCoil!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(null, false)
      })

      it('returns error for invalid unitId (>255)', async () => {
        const cb = vi.fn()
        await vector.getCoil!(0, 300, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: SERVER_DEVICE_FAILURE }),
          false
        )
      })

      it('returns error when no data exists for unitId', async () => {
        const cb = vi.fn()
        await vector.getCoil!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: ILLEGAL_DATA_ADDRESS }),
          false
        )
      })
    })

    describe('getDiscreteInput', () => {
      it('returns discrete input value', async () => {
        server.setBool({ uuid, unitId, registerType: 'discrete_inputs', address: 3, state: true })
        const cb = vi.fn()
        await vector.getDiscreteInput!(3, 1, cb)
        expect(cb).toHaveBeenCalledWith(null, true)
      })

      it('returns error for invalid unitId', async () => {
        const cb = vi.fn()
        await vector.getDiscreteInput!(0, 300, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: SERVER_DEVICE_FAILURE }),
          false
        )
      })

      it('returns error when no data exists', async () => {
        const cb = vi.fn()
        await vector.getDiscreteInput!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: ILLEGAL_DATA_ADDRESS }),
          false
        )
      })
    })

    describe('getInputRegister', () => {
      it('returns input register value', async () => {
        server.addRegister({
          uuid,
          unitId,
          littleEndian: false,
          params: {
            address: 10,
            registerType: 'input_registers',
            dataType: 'uint16',

            comment: '',
            value: 42,
            min: undefined,
            max: undefined,
            interval: undefined
          }
        })
        const cb = vi.fn()
        await vector.getInputRegister!(10, 1, cb)
        expect(cb).toHaveBeenCalledWith(null, 42)
      })

      it('returns error for invalid unitId', async () => {
        const cb = vi.fn()
        await vector.getInputRegister!(0, 300, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: SERVER_DEVICE_FAILURE }),
          0
        )
      })

      it('returns error when no data exists', async () => {
        const cb = vi.fn()
        await vector.getInputRegister!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: ILLEGAL_DATA_ADDRESS }),
          0
        )
      })
    })

    describe('getHoldingRegister', () => {
      it('returns holding register value', async () => {
        server.addRegister({
          uuid,
          unitId,
          littleEndian: false,
          params: {
            address: 0,
            registerType: 'holding_registers',
            dataType: 'uint16',

            comment: '',
            value: 999,
            min: undefined,
            max: undefined,
            interval: undefined
          }
        })
        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(null, 999)
      })

      it('returns error for invalid unitId', async () => {
        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 300, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: SERVER_DEVICE_FAILURE }),
          0
        )
      })

      it('returns error when no data exists', async () => {
        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: ILLEGAL_DATA_ADDRESS }),
          0
        )
      })
    })

    describe('setCoil', () => {
      it('sets coil value and emits event', async () => {
        // First ensure data exists
        server.setBool({ uuid, unitId, registerType: 'coils', address: 0, state: false })
        ;(windows.send as ReturnType<typeof vi.fn>).mockClear()

        const cb = vi.fn()
        await vector.setCoil!(10, true, 1, cb)
        expect(cb).toHaveBeenCalledWith(null)
        expect(windows.send).toHaveBeenCalledWith(
          'boolean_value',
          expect.objectContaining({ uuid, unitId, registerType: 'coils', address: 10, value: true })
        )
      })

      it('creates default data when unitId has no existing data', async () => {
        const cb = vi.fn()
        await vector.setCoil!(5, true, 1, cb)
        expect(cb).toHaveBeenCalledWith(null)

        // Verify the coil was set by reading it back
        const getCb = vi.fn()
        await vector.getCoil!(5, 1, getCb)
        expect(getCb).toHaveBeenCalledWith(null, true)
      })

      it('returns error for invalid unitId', async () => {
        const cb = vi.fn()
        await vector.setCoil!(0, true, 300, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: SERVER_DEVICE_FAILURE }),
          0
        )
      })
    })

    describe('setHoldingRegister', () => {
      it('sets register value and emits event', async () => {
        // First ensure data exists
        server.addRegister({
          uuid,
          unitId,
          littleEndian: false,
          params: {
            address: 0,
            registerType: 'holding_registers',
            dataType: 'uint16',

            comment: '',
            value: 0,
            min: undefined,
            max: undefined,
            interval: undefined
          }
        })
        ;(windows.send as ReturnType<typeof vi.fn>).mockClear()

        const cb = vi.fn()
        await vector.setRegister!(20, 12345, 1, cb)
        expect(cb).toHaveBeenCalledWith(null)
        expect(windows.send).toHaveBeenCalledWith(
          'register_value',
          expect.objectContaining({
            uuid,
            unitId,
            registerType: 'holding_registers',
            address: 20,
            raw: 12345
          })
        )
      })

      it('creates default data when unitId has no existing data', async () => {
        const cb = vi.fn()
        await vector.setRegister!(0, 500, 1, cb)
        expect(cb).toHaveBeenCalledWith(null)

        // Verify it was set
        const getCb = vi.fn()
        await vector.getHoldingRegister!(0, 1, getCb)
        expect(getCb).toHaveBeenCalledWith(null, 500)
      })

      it('returns error for invalid unitId', async () => {
        const cb = vi.fn()
        await vector.setRegister!(0, 100, 300, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: SERVER_DEVICE_FAILURE }),
          0
        )
      })
    })
  })
})

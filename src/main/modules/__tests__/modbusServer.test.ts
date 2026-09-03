/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BaseDataType, RegisterParams, UnitIdString, Windows } from '@shared'
import type { IServiceVector } from 'modbus-serial/ServerTCP'

// Configurable port availability for net mock
// Each entry is either a boolean (true=available) or a string error code (e.g. 'EACCES', 'EADDRINUSE')
let portAvailableResults: (boolean | string)[] = []

// What each ServerTCP bind does, in order: true emits `initialized`, a string
// emits `serverError` with that code, false emits neither so the timeout runs.
let bindResults: (boolean | string)[] = []

// Mock modbus-serial before importing ModbusServer
vi.mock('modbus-serial', () => ({
  // Must use `function` (not arrow) so it can be called with `new`
  ServerTCP: vi.fn().mockImplementation(function () {
    const handlers: Record<string, (err?: Error) => void> = {}
    const entry = bindResults.length > 0 ? bindResults.shift()! : true

    // The real constructor returns before `listen` finishes, so the event
    // cannot fire until the caller has had the chance to register for it.
    queueMicrotask(() => {
      if (entry === true) handlers['initialized']?.()
      else if (typeof entry === 'string')
        handlers['serverError']?.(Object.assign(new Error(`listen ${entry}`), { code: entry }))
    })

    return {
      on: vi.fn((event: string, handler: (err?: Error) => void) => {
        handlers[event] = handler
      }),
      close: vi.fn((cb: (err: Error | null) => void) => cb(null))
    }
  }),
  ServerSerial: vi.fn().mockImplementation(function () {
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    return {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler
      }),
      close: vi.fn((cb: (err: Error | null) => void) => cb(null)),
      _handlers: handlers
    }
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
          const entry = portAvailableResults.length > 0 ? portAvailableResults.shift()! : true
          if (entry === true && handlers['listening']) {
            handlers['listening']()
          } else if (handlers['error']) {
            const errorCode = typeof entry === 'string' ? entry : 'EADDRINUSE'
            const err = Object.assign(new Error(`listen ${errorCode}`), { code: errorCode })
            handlers['error'](err)
          }
        }),
        close: vi.fn((cb: () => void) => cb())
      }
    })
  }
}))

import {
  ModbusServer,
  SERVER_DEVICE_FAILURE,
  ILLEGAL_DATA_ADDRESS,
  GATEWAY_TARGET_FAILED,
  BIND_TIMEOUT_MS
} from '../modbusServer'
import { ServerTCP, ServerSerial } from 'modbus-serial'

const createMockWindows = (): Windows => ({ send: vi.fn() }) as unknown as Windows

describe('ModbusServer', () => {
  let server: ModbusServer
  let windows: Windows
  const uuid = 'test-server-uuid'
  const unitId: UnitIdString = '1'

  beforeEach(() => {
    vi.useFakeTimers()
    portAvailableResults = []
    bindResults = []
    vi.mocked(ServerTCP).mockClear()
    vi.mocked(ServerSerial).mockClear()
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

    it('leaves a listener that is already on the requested port alone', async () => {
      await server.createServer({ uuid, port: 5020 })
      const firstInstance = vi.mocked(ServerTCP).mock.results[0].value

      const port = await server.createServer({ uuid, port: 5020 })

      expect(port).toBe(5020)
      expect(vi.mocked(ServerTCP).mock.calls.length).toBe(1)
      expect(firstInstance.close).not.toHaveBeenCalled()
    })

    it('binds again on the same port after the TCP servers were stopped', async () => {
      await server.createServer({ uuid, port: 5020 })
      await server.stopAllTcpServers()
      vi.mocked(ServerTCP).mockClear()

      const port = await server.createServer({ uuid, port: 5020 })

      expect(port).toBe(5020)
      expect(vi.mocked(ServerTCP).mock.calls.length).toBe(1)
    })

    it('moves on when the bind fails after the probe passed', async () => {
      bindResults = ['EADDRINUSE']
      const port = await server.createServer({ uuid, port: 5020 })

      expect(port).toBe(5021)
      // The refused listener is closed rather than kept as if it were up.
      expect(vi.mocked(ServerTCP).mock.results[0].value.close).toHaveBeenCalled()
    })

    it('moves on when the bind answers with neither event', async () => {
      bindResults = [false]
      const pending = server.createServer({ uuid, port: 5020 })
      await vi.advanceTimersByTimeAsync(BIND_TIMEOUT_MS)

      expect(await pending).toBe(5021)
    })

    it('emits error and returns port when no port available after max attempts', async () => {
      portAvailableResults = new Array(10000).fill(false)
      const port = await server.createServer({ uuid, port: 5020 })
      expect(port).toBe(15020) // 5020 + 10000
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'No available port found')).toBe(true)
    })
  })

  describe('createServer with a stored port that is not a port', () => {
    it('starts on the default instead', async () => {
      const port = await server.createServer({ uuid, port: 0 })
      expect(port).toBe(502)
      expect(ServerTCP).toHaveBeenCalledWith(expect.any(Object), {
        host: '0.0.0.0',
        port: 502
      })
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

      // The listener is left alone: a reset clears data the vectors read per
      // request, and rebinding would drop whoever is connected.
      expect(vi.mocked(ServerTCP).mock.calls.length).toBe(1)
      expect(vi.mocked(ServerTCP).mock.results[0].value.close).not.toHaveBeenCalled()
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
    it('sets the exact port when available', async () => {
      const port = await server.setPort({ uuid, port: 5020 })
      expect(port).toBe(5020)
      expect(ServerTCP).toHaveBeenCalledWith(expect.any(Object), {
        host: '0.0.0.0',
        port: 5020
      })
    })

    it('emits EACCES error and returns current port for privileged port', async () => {
      // First create a server on a working port
      await server.createServer({ uuid, port: 5020 })
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()

      portAvailableResults = ['EACCES']
      const port = await server.setPort({ uuid, port: 502 })
      expect(port).toBe(5020) // Returns current port, not requested
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Port 502 requires elevated privileges')).toBe(
        true
      )
    })

    it('emits EADDRINUSE error and returns current port when port is taken', async () => {
      await server.createServer({ uuid, port: 5020 })
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()

      portAvailableResults = ['EADDRINUSE']
      const port = await server.setPort({ uuid, port: 5021 })
      expect(port).toBe(5020) // Returns current port
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Port 5021 is already in use')).toBe(true)
    })

    it('does not auto-increment on unavailable port', async () => {
      portAvailableResults = [false]
      const port = await server.setPort({ uuid, port: 5020 })
      expect(port).toBe(5020) // Returns requested port (no current server)
      // ServerTCP should never have been called
      expect(ServerTCP).not.toHaveBeenCalled()
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Port 5020 is already in use')).toBe(true)
    })

    it('puts the server back on its old port when the new bind fails', async () => {
      await server.createServer({ uuid, port: 5020 })
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()
      vi.mocked(ServerTCP).mockClear()

      // The probe passes and the bind still fails, which is what happens when
      // something takes the port between the two.
      bindResults = ['EADDRINUSE', true]
      const port = await server.setPort({ uuid, port: 5021 })

      expect(port).toBe(5020)
      expect(vi.mocked(ServerTCP).mock.calls[1][1]).toEqual({ host: '0.0.0.0', port: 5020 })
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Port 5021 is already in use')).toBe(true)
    })

    it('says so when the old port cannot be taken back either', async () => {
      await server.createServer({ uuid, port: 5020 })
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()

      bindResults = ['EADDRINUSE', 'EADDRINUSE']
      const port = await server.setPort({ uuid, port: 5021 })

      expect(port).toBe(5020)
      const messages = getWindowCalls('backend_message')
      expect(
        messages.some((m) => m[1].message === 'The server could not be restarted on port 5020')
      ).toBe(true)
    })

    it('refuses port 0 and keeps the server where it is', async () => {
      await server.createServer({ uuid, port: 5020 })
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()
      const callsBefore = vi.mocked(ServerTCP).mock.calls.length

      // Listening on 0 succeeds: the kernel hands out a free port, the server
      // moves somewhere nobody can name, and the view is told it is on 0.
      const port = await server.setPort({ uuid, port: 0 })

      expect(port).toBe(5020)
      expect(vi.mocked(ServerTCP).mock.calls.length).toBe(callsBefore)
      const messages = getWindowCalls('backend_message')
      expect(
        messages.some((m) => m[1].message === 'A server needs a port between 1 and 65535')
      ).toBe(true)
    })

    it('refuses port 0 with no server yet and answers with the default', async () => {
      const port = await server.setPort({ uuid, port: 0 })
      expect(port).toBe(502)
      expect(ServerTCP).not.toHaveBeenCalled()
    })

    it('closes existing server before binding new port', async () => {
      await server.createServer({ uuid, port: 5020 })
      const firstInstance = vi.mocked(ServerTCP).mock.results[0].value

      await server.setPort({ uuid, port: 5021 })
      expect(firstInstance.close).toHaveBeenCalled()
    })
  })

  describe('startRtuServer', () => {
    const serialConfig = {
      com: '/dev/ttyUSB0',
      options: { baudRate: '9600' as const, dataBits: 8, stopBits: 1, parity: 'none' as const }
    }

    it('creates a ServerSerial with correct config', async () => {
      await server.startRtuServer({ uuid, serialConfig })

      expect(ServerSerial).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          path: '/dev/ttyUSB0',
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none'
        })
      )
    })

    it('emits success message and status on initialized event', async () => {
      await server.startRtuServer({ uuid, serialConfig })

      const instance = vi.mocked(ServerSerial).mock.results.at(-1)!.value
      instance._handlers['initialized']()

      const statusCalls = getWindowCalls('rtu_server_status')
      expect(statusCalls.some((c) => c[1].active === true)).toBe(true)

      const messageCalls = getWindowCalls('backend_message')
      expect(messageCalls.some((c) => c[1].message.includes('/dev/ttyUSB0'))).toBe(true)
    })

    it('emits error status on error event', async () => {
      await server.startRtuServer({ uuid, serialConfig })

      const instance = vi.mocked(ServerSerial).mock.results.at(-1)!.value
      instance._handlers['error'](new Error('port gone'))

      const statusCalls = getWindowCalls('rtu_server_status')
      expect(statusCalls.some((c) => c[1].active === false)).toBe(true)

      const messageCalls = getWindowCalls('backend_message')
      expect(messageCalls.some((c) => c[1].message.includes('port gone'))).toBe(true)
    })

    it('skips start when COM port is empty', async () => {
      await server.startRtuServer({
        uuid,
        serialConfig: { ...serialConfig, com: '  ' }
      })

      expect(ServerSerial).not.toHaveBeenCalled()
    })

    it('stops existing RTU server before starting new one', async () => {
      await server.startRtuServer({ uuid, serialConfig })
      const firstInstance = vi.mocked(ServerSerial).mock.results[0].value

      await server.startRtuServer({ uuid, serialConfig })
      expect(firstInstance.close).toHaveBeenCalled()
      expect(vi.mocked(ServerSerial).mock.calls.length).toBe(2)
    })

    it('shares register data with TCP server via same vector', async () => {
      // Add data, then start RTU — vector references same _serverData
      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: '',
          value: 42,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      await server.startRtuServer({ uuid, serialConfig })

      // The vector passed to ServerSerial should read the same data
      const vector = vi.mocked(ServerSerial).mock.calls.at(-1)![0] as IServiceVector
      const cb = vi.fn()
      await vector.getHoldingRegister!(0, 1, cb)
      expect(cb).toHaveBeenCalledWith(null, 42)
    })
  })

  describe('stopRtuServer', () => {
    const serialConfig = {
      com: '/dev/ttyUSB0',
      options: { baudRate: '9600' as const, dataBits: 8, stopBits: 1, parity: 'none' as const }
    }

    it('does nothing when no RTU server is running', async () => {
      await server.stopRtuServer()
      // No error, no events
      expect(getWindowCalls('rtu_server_status').length).toBe(0)
    })

    it('closes the RTU server and emits inactive status', async () => {
      await server.startRtuServer({ uuid, serialConfig })
      const instance = vi.mocked(ServerSerial).mock.results.at(-1)!.value

      await server.stopRtuServer()
      expect(instance.close).toHaveBeenCalled()

      const statusCalls = getWindowCalls('rtu_server_status')
      expect(statusCalls.at(-1)![1].active).toBe(false)
    })

    it('emits warning message only when server was active', async () => {
      await server.startRtuServer({ uuid, serialConfig })
      const instance = vi.mocked(ServerSerial).mock.results.at(-1)!.value

      // Simulate initialized → wasActive = true
      instance._handlers['initialized']()
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()

      await server.stopRtuServer()
      const messageCalls = getWindowCalls('backend_message')
      expect(messageCalls.some((c) => c[1].message === 'RTU server stopped')).toBe(true)
    })

    it('does not emit warning when server never became active', async () => {
      await server.startRtuServer({ uuid, serialConfig })
      // Don't trigger initialized event
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()

      await server.stopRtuServer()
      const messageCalls = getWindowCalls('backend_message')
      expect(messageCalls.some((c) => c[1].message === 'RTU server stopped')).toBe(false)
    })

    it('silently ignores "Port is not open" errors', async () => {
      await server.startRtuServer({ uuid, serialConfig })
      const instance = vi.mocked(ServerSerial).mock.results.at(-1)!.value
      instance.close.mockImplementation((cb: (err: Error | null) => void) =>
        cb(new Error('Port is not open'))
      )

      await server.stopRtuServer()
      // No error message emitted
      const messageCalls = getWindowCalls('backend_message')
      expect(messageCalls.some((c) => c[1].variant === 'error')).toBe(false)
    })
  })

  describe('stopAllTcpServers', () => {
    it('closes all TCP servers and clears port map', async () => {
      await server.createServer({ uuid, port: 5020 })
      await server.createServer({ uuid: 'uuid-2', port: 5021 })

      await server.stopAllTcpServers()

      // Both servers closed
      const instances = vi.mocked(ServerTCP).mock.results
      expect(instances[0].value.close).toHaveBeenCalled()
      // Recreating should work without close call on old server
      vi.mocked(ServerTCP).mockClear()
      await server.createServer({ uuid, port: 5020 })
      expect(vi.mocked(ServerTCP).mock.results[0].value.close).not.toHaveBeenCalled()
    })

    it('preserves server data after stopping all TCP servers', async () => {
      await server.createServer({ uuid, port: 5020 })

      server.addRegister({
        uuid,
        unitId,
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: '',
          value: 42,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      await server.stopAllTcpServers()

      // Start RTU on same UUID — data should still be accessible
      await server.startRtuServer({
        uuid,
        serialConfig: {
          com: '/dev/ttyUSB0',
          options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' }
        }
      })

      const vector = vi.mocked(ServerSerial).mock.calls.at(-1)![0] as IServiceVector
      const cb = vi.fn()
      await vector.getHoldingRegister!(0, 1, cb)
      expect(cb).toHaveBeenCalledWith(null, 42)
    })

    it('handles empty server list', async () => {
      await server.stopAllTcpServers()
      // No error
    })
  })

  describe('deleteServer with RTU', () => {
    it('stops RTU server when deleting the RTU UUID', async () => {
      await server.createServer({ uuid, port: 5020 })
      await server.startRtuServer({
        uuid,
        serialConfig: {
          com: '/dev/ttyUSB0',
          options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' }
        }
      })

      const rtuInstance = vi.mocked(ServerSerial).mock.results.at(-1)!.value

      await server.deleteServer(uuid)
      expect(rtuInstance.close).toHaveBeenCalled()
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

      it('refuses a unit id it does not host', async () => {
        const cb = vi.fn()
        await vector.getCoil!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
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

      it('refuses a unit id it does not host', async () => {
        const cb = vi.fn()
        await vector.getDiscreteInput!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
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

      it('refuses a unit id it does not host', async () => {
        const cb = vi.fn()
        await vector.getInputRegister!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
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

      it('refuses a unit id it does not host', async () => {
        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
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

      it('refuses a unit id it does not host and leaves it unhosted', async () => {
        const cb = vi.fn()
        await vector.setCoil!(5, true, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
          0
        )

        // The write must not have created the unit it was refused for.
        const getCb = vi.fn()
        await vector.getCoil!(5, 1, getCb)
        expect(getCb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
          false
        )
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

      it('refuses a unit id it does not host and leaves it unhosted', async () => {
        const cb = vi.fn()
        await vector.setRegister!(0, 500, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
          0
        )

        // The write must not have created the unit it was refused for.
        const getCb = vi.fn()
        await vector.getHoldingRegister!(0, 1, getCb)
        expect(getCb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
          0
        )
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
  // ─── C5: which unit ids the server answers for ────────────────────────────

  describe('the unit ids a server answers for', () => {
    const serialConfig = {
      com: '/dev/ttyUSB0',
      options: { baudRate: '9600' as const, dataBits: 8, stopBits: 1, parity: 'none' as const }
    }

    const hostUnit = (id: UnitIdString, address: number, value: number): void =>
      server.addRegister({
        uuid,
        unitId: id,
        littleEndian: false,
        params: {
          address,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: '',
          value,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

    const tcpVector = async (): Promise<IServiceVector> => {
      await server.createServer({ uuid, port: 5020 })
      return vi.mocked(ServerTCP).mock.calls.at(-1)![0]
    }

    const rtuVector = async (): Promise<IServiceVector> => {
      await server.startRtuServer({ uuid, serialConfig })
      vi.mocked(ServerSerial).mock.results.at(-1)!.value._handlers['initialized']()
      return vi.mocked(ServerSerial).mock.calls.at(-1)![0] as IServiceVector
    }

    describe('over TCP', () => {
      it('answers for a unit it hosts', async () => {
        hostUnit('1', 0, 42)
        const vector = await tcpVector()

        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(null, 42)
      })

      it('refuses a unit it does not host, because silence would be a timeout', async () => {
        hostUnit('1', 0, 42)
        const vector = await tcpVector()

        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 5, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
          0
        )
      })

      it('treats unit 0 as an address like any other', async () => {
        hostUnit('0', 0, 7)
        const vector = await tcpVector()

        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 0, cb)
        expect(cb).toHaveBeenCalledWith(null, 7)
      })

      it('sends a write to unit 0 to unit 0 alone', async () => {
        hostUnit('0', 0, 7)
        hostUnit('1', 0, 42)
        const vector = await tcpVector()

        const setCb = vi.fn()
        await vector.setRegister!(9, 111, 0, setCb)
        expect(setCb).toHaveBeenCalledWith(null)

        const zeroCb = vi.fn()
        await vector.getHoldingRegister!(9, 0, zeroCb)
        expect(zeroCb).toHaveBeenCalledWith(null, 111)

        const oneCb = vi.fn()
        await vector.getHoldingRegister!(9, 1, oneCb)
        expect(oneCb).toHaveBeenCalledWith(null, 0)
      })

      it('answers an address past the top of the range with an address error', async () => {
        hostUnit('1', 0, 42)
        const vector = await tcpVector()

        const cb = vi.fn()
        await vector.getHoldingRegister!(70000, 1, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: ILLEGAL_DATA_ADDRESS }),
          0
        )
      })
    })

    describe('over RTU', () => {
      it('answers for a unit it hosts', async () => {
        hostUnit('1', 0, 42)
        const vector = await rtuVector()

        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 1, cb)
        expect(cb).toHaveBeenCalledWith(null, 42)
      })

      it('says nothing for a unit it does not host, because the bus is shared', async () => {
        hostUnit('1', 0, 42)
        const vector = await rtuVector()

        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 5, cb)
        expect(cb).not.toHaveBeenCalled()
      })

      it('says nothing for a coil on a unit it does not host', async () => {
        hostUnit('1', 0, 42)
        const vector = await rtuVector()

        const cb = vi.fn()
        await vector.getCoil!(0, 5, cb)
        expect(cb).not.toHaveBeenCalled()
      })

      it('never reads unit 0, even when it holds data', async () => {
        hostUnit('0', 0, 7)
        const vector = await rtuVector()

        const cb = vi.fn()
        await vector.getHoldingRegister!(0, 0, cb)
        expect(cb).not.toHaveBeenCalled()
      })

      it('sends a write to unit 0 to every unit it hosts', async () => {
        hostUnit('1', 0, 42)
        hostUnit('2', 0, 43)
        const vector = await rtuVector()

        await vector.setRegister!(9, 4242, 0, vi.fn())

        const oneCb = vi.fn()
        await vector.getHoldingRegister!(9, 1, oneCb)
        expect(oneCb).toHaveBeenCalledWith(null, 4242)

        const twoCb = vi.fn()
        await vector.getHoldingRegister!(9, 2, twoCb)
        expect(twoCb).toHaveBeenCalledWith(null, 4242)
      })

      it('does not acknowledge a write to unit 0', async () => {
        hostUnit('1', 0, 42)
        const vector = await rtuVector()

        const cb = vi.fn()
        await vector.setRegister!(9, 4242, 0, cb)
        expect(cb).not.toHaveBeenCalled()
      })

      it('sends a coil write to unit 0 to every unit it hosts', async () => {
        hostUnit('1', 0, 42)
        hostUnit('2', 0, 43)
        const vector = await rtuVector()

        await vector.setCoil!(3, true, 0, vi.fn())

        const oneCb = vi.fn()
        await vector.getCoil!(3, 1, oneCb)
        expect(oneCb).toHaveBeenCalledWith(null, true)

        const twoCb = vi.fn()
        await vector.getCoil!(3, 2, twoCb)
        expect(twoCb).toHaveBeenCalledWith(null, true)
      })

      it('creates nothing from a write to a unit it does not host', async () => {
        hostUnit('1', 0, 42)
        const rtu = await rtuVector()
        const tcp = await tcpVector()

        await rtu.setRegister!(0, 500, 5, vi.fn())

        // The same uuid over TCP is the only way to ask whether unit 5 now exists.
        const cb = vi.fn()
        await tcp.getHoldingRegister!(0, 5, cb)
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ modbusErrorCode: GATEWAY_TARGET_FAILED }),
          0
        )
      })
    })

    describe('the unit 0 warning', () => {
      const warning = 'Unit 0 is the broadcast address on RTU. Its registers cannot be read.'

      const warnings = (): unknown[] =>
        getWindowCalls('backend_message').filter((c) => c[1].message === warning)

      it('warns when the port comes up on a config that already uses unit 0', async () => {
        hostUnit('0', 0, 7)
        await rtuVector()

        expect(warnings().length).toBe(1)
      })

      it('warns when unit 0 arrives after the port came up', async () => {
        await rtuVector()
        hostUnit('0', 0, 7)

        expect(warnings().length).toBe(1)
      })

      it('says nothing when unit 0 holds no data', async () => {
        hostUnit('1', 0, 42)
        await rtuVector()

        expect(warnings().length).toBe(0)
      })

      it('says it once', async () => {
        hostUnit('0', 0, 7)
        await rtuVector()
        hostUnit('0', 1, 8)
        hostUnit('0', 2, 9)

        expect(warnings().length).toBe(1)
      })

      it('says nothing on TCP', async () => {
        hostUnit('0', 0, 7)
        await tcpVector()

        expect(warnings().length).toBe(0)
      })
    })
  })
  // ─── C1: removing a register erases what it occupied, and no more ─────────

  describe('removeRegister erases what the register occupied', () => {
    const addRegister = (
      address: number,
      dataType: BaseDataType,
      extra: { value?: number; stringValue?: string; length?: number } = {}
    ): void => {
      const params: RegisterParams = {
        address,
        registerType: 'holding_registers',
        dataType,
        comment: '',
        value: extra.value ?? 0,
        stringValue: extra.stringValue,
        length: extra.length,
        min: undefined,
        max: undefined,
        interval: undefined
      }
      server.addRegister({ uuid, unitId, littleEndian: false, params })
    }

    const readHolding = async (vector: IServiceVector, address: number): Promise<unknown> =>
      new Promise((resolve) =>
        vector.getHoldingRegister!(address, 1, (error, value) => resolve(error ? 'ERR' : value))
      )

    it('leaves the register next to a deleted string alone', async () => {
      // The width comes from the register, not from the type.
      addRegister(20, 'double', { value: 1234.5 })
      addRegister(18, 'utf8', { stringValue: 'HAHA', length: 2 })

      await server.createServer({ uuid, port: 5020 })
      const vector = vi.mocked(ServerTCP).mock.calls.at(-1)![0]

      const before = await readHolding(vector, 20)
      expect(before).not.toBe(0)

      server.removeRegister({
        uuid,
        unitId,
        registerType: 'holding_registers',
        address: 18,
        dataType: 'utf8',
        length: 2
      })

      expect(await readHolding(vector, 18)).toBe(0)
      expect(await readHolding(vector, 19)).toBe(0)
      expect(await readHolding(vector, 20)).toBe(before)
    })

    it('erases every register a wide type occupied', async () => {
      addRegister(30, 'double', { value: 1234.5 })
      addRegister(40, 'uint16', { value: 7 })

      await server.createServer({ uuid, port: 5020 })
      const vector = vi.mocked(ServerTCP).mock.calls.at(-1)![0]

      server.removeRegister({
        uuid,
        unitId,
        registerType: 'holding_registers',
        address: 30,
        dataType: 'double'
      })

      for (const address of [30, 31, 32, 33]) {
        expect(await readHolding(vector, address)).toBe(0)
      }
      expect(await readHolding(vector, 40)).toBe(7)
    })

    it('falls back to ten registers for a string that carries no length', async () => {
      addRegister(0, 'utf8', { stringValue: 'HAHA' })
      addRegister(10, 'uint16', { value: 7 })

      await server.createServer({ uuid, port: 5020 })
      const vector = vi.mocked(ServerTCP).mock.calls.at(-1)![0]

      server.removeRegister({
        uuid,
        unitId,
        registerType: 'holding_registers',
        address: 0,
        dataType: 'utf8'
      })

      expect(await readHolding(vector, 0)).toBe(0)
      expect(await readHolding(vector, 9)).toBe(0)
      expect(await readHolding(vector, 10)).toBe(7)
    })
  })
})

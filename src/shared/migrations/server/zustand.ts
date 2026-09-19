import { defaultSerialPortOptions } from '../../default'
import { V1RegisterParams, V1ServerRegistersPerUnit, extractGlobalEndianness } from './v1'
import {
  dropUnservableRegisters,
  migrateBoolShapeForUnit,
  repairPersistedParity,
  stringifyExact64BitValues
} from '../shared'

/**
 * One number above what the last release wrote, whatever this branch changes.
 *
 * 2.3.0 shipped 3, and nobody outside this branch has a store carrying 4
 * through 8. A number per change was five migration steps no launch will ever
 * run, so the steps between are one step from 3.
 */
export const CURRENT_SERVER_ZUSTAND_VERSION = 4

/** Where the server store keeps its state. */
export const SERVER_ZUSTAND_STORAGE_KEY = 'server.zustand'

interface V1ZustandServerState {
  serverRegisters?: Record<string, V1ServerRegistersPerUnit | undefined>
  littleEndian?: Record<string, boolean>
}

/**
 * Convert old `boolean` bool entries to `{ value: boolean }` shape.
 * Safe to call on already-migrated data (entries that are objects are skipped).
 */
export function migrateBoolShape(
  serverRegisters: Record<string, Record<string, unknown> | undefined> | undefined
): void {
  if (!serverRegisters) return

  for (const serverPerUnit of Object.values(serverRegisters)) {
    if (!serverPerUnit) continue

    for (const unitRegisters of Object.values(serverPerUnit)) {
      migrateBoolShapeForUnit(unitRegisters)
    }
  }
}

/**
 * Migrate server Zustand state from v2 to v3: add serverMode and serialConfig defaults.
 */
export function migrateServerModeState(state: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...state }
  if (!migrated.serverMode) {
    migrated.serverMode = 'tcp'
  }
  if (!migrated.serialConfig) {
    // The same four options as `getDefaultSerialConfig`, which spreads this
    // too. They were a literal here, so a store with no serial config was the
    // one of the three that agreed by coincidence.
    migrated.serialConfig = { com: '', options: { ...defaultSerialPortOptions } }
  }
  return migrated
}

/**
 * Migrate server Zustand state from v1 (littleEndian per register) to v2 (global littleEndian).
 * Also converts old boolean shape to { value: boolean } entries.
 * Used by Zustand persist middleware.
 */
export function migrateServerRegistersState(
  oldState: Record<string, unknown>
): Record<string, unknown> {
  const migrated = { ...oldState } as Record<string, unknown> & V1ZustandServerState

  // Add littleEndian field per uuid if it doesn't exist
  if (!migrated.littleEndian) {
    migrated.littleEndian = {}
  }

  const serverRegisters = migrated.serverRegisters ?? {}

  // Migrate each server's registers
  for (const [uuid, serverPerUnit] of Object.entries(serverRegisters)) {
    if (!serverPerUnit) continue

    // Extract global endianness from all registers across all units
    const { endianness, wasMixed } = extractGlobalEndianness(serverPerUnit)

    // Set global littleEndian for this server uuid
    migrated.littleEndian[uuid] = endianness

    // Remove littleEndian from all register params
    for (const serverRegisters of Object.values(serverPerUnit)) {
      if (!serverRegisters) continue

      const registerTypes: Array<'input_registers' | 'holding_registers'> = [
        'input_registers',
        'holding_registers'
      ]
      for (const regType of registerTypes) {
        const registers = serverRegisters[regType]
        if (!registers) continue

        for (const entry of Object.values(registers)) {
          if (!entry?.params) continue
          // Remove littleEndian in-place (mutating is intentional for localStorage migration)
          delete (entry.params as Partial<V1RegisterParams>).littleEndian
        }
      }
    }

    if (wasMixed && import.meta.env.DEV) {
      console.warn(`Server ${uuid}: Mixed endianness detected during localStorage migration`)
    }
  }

  // Convert old boolean shape (boolean -> { value: boolean })
  migrateBoolShape(
    migrated.serverRegisters as Record<string, Record<string, unknown> | undefined> | undefined
  )

  return migrated
}

/**
 * Migrate server Zustand state to the current version.
 * Used by Zustand persist middleware.
 *
 * Here rather than inline in `server.zustand.ts`, where a test reaches every
 * step it calls and none of the calls: dropping a whole `if` there left the
 * suite green.
 */
export function migrateServerState(
  persistedState: unknown,
  version: number
): Record<string, unknown> {
  let state = persistedState as Record<string, unknown>

  // Version 0/1 (old format with littleEndian per register)
  if (version < 2) {
    state = migrateServerRegistersState(state)
  }

  // v2→v3: add serverMode and serialConfig
  if (version < 3) {
    state = migrateServerModeState(state)
    // Also convert old boolean shape if needed
    migrateBoolShape(
      state.serverRegisters as Record<string, Record<string, unknown> | undefined> | undefined
    )
  }

  // v3→v4, which is one step because 3 is what the last release wrote. The
  // parity the serial binding refuses, registers outside the 16 bit map, a
  // string width, a fixed value or an interval the encoder, the map or
  // `setInterval` cannot take, and a 64 bit composite that has to be a decimal
  // string for the first word write after a launch to read it exactly.
  //
  // Any version but this one, rather than the ones below it. persist calls
  // this for every version that is not the current one, and `repairPersisted`
  // then reads a blob from a newer Modbux field by field with
  // `savedByNewerVersion` set, so a newer blob is exactly where a parity this
  // enum does not name and a register this schema refuses come from, and
  // without these steps one of either costs every register on every server.
  // `migrateServerConfig` answers the same question with its own
  // `detectedVersion > CURRENT` branch; the store had none.
  if (version !== CURRENT_SERVER_ZUSTAND_VERSION) {
    repairPersistedParity(state, 'serialConfig', 'options')
    dropUnservableRegisters(state)
    stringifyExact64BitValues(state)
  }

  return state
}

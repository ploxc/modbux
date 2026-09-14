import { V1RegisterParams, V1ServerRegistersPerUnit, extractGlobalEndianness } from './shared'
import { dropUnservableRegisters, migrateBoolShapeForUnit, repairPersistedParity } from '../shared'

export const CURRENT_SERVER_ZUSTAND_VERSION = 6

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
 * Migrate server Zustand state from v1 (littleEndian per register) to v2 (global littleEndian).
 * Also converts old boolean shape to { value: boolean } entries.
 * Used by Zustand persist middleware.
 */
/**
 * Migrate server Zustand state from v2 to v3: add serverMode and serialConfig defaults.
 */
export function migrateServerModeState(state: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...state }
  if (!migrated.serverMode) {
    migrated.serverMode = 'tcp'
  }
  if (!migrated.serialConfig) {
    migrated.serialConfig = {
      com: '',
      options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' }
    }
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
 * This stood inline in `server.zustand.ts`, where a test could reach every step
 * it calls and none of the calls. Dropping a whole `if` left the suite green.
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

  // v3→v4: the RTU parity the serial binding refuses
  if (version < 4) {
    repairPersistedParity(state, 'serialConfig', 'options')
  }

  // v4→v5: registers at an address outside the 16 bit map
  // v5→v6: and generators the interval floor now refuses
  if (version < 6) {
    dropUnservableRegisters(state)
  }

  return state
}

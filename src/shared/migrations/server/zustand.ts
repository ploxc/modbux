import { V1RegisterParams, V1ServerRegistersPerUnit, extractGlobalEndianness } from './shared'

export const CURRENT_SERVER_ZUSTAND_VERSION = 2

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
      if (!unitRegisters || typeof unitRegisters !== 'object') continue
      const regs = unitRegisters as Record<string, unknown>

      for (const boolType of ['coils', 'discrete_inputs'] as const) {
        const boolRecord = regs[boolType]
        if (!boolRecord || typeof boolRecord !== 'object') continue

        for (const [addr, entry] of Object.entries(boolRecord as Record<string, unknown>)) {
          if (typeof entry === 'boolean') {
            ;(boolRecord as Record<string, unknown>)[addr] = { value: entry }
          }
        }
      }
    }
  }
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

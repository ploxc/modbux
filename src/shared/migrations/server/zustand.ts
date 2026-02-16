import { V1RegisterParams, V1ServerRegistersPerUnit, extractGlobalEndianness } from './shared'

export const CURRENT_SERVER_ZUSTAND_VERSION = 2

interface V1ZustandServerState {
  serverRegisters?: Record<string, V1ServerRegistersPerUnit | undefined>
  littleEndian?: Record<string, boolean>
}

/**
 * Migrate server Zustand state from v1 (littleEndian per register) to v2 (global littleEndian).
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

  return migrated
}

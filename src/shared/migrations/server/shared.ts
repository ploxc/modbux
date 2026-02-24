import { RegisterParams } from '../../types/server'

//
// V1 types — describe the old config format for type-safe migration
//

export interface V1RegisterParams extends Omit<RegisterParams, never> {
  littleEndian: boolean
}

export interface V1ServerRegisterEntry {
  value: number
  params: V1RegisterParams
}

export type V1ServerRegister = Record<string, V1ServerRegisterEntry>

export interface V1ServerRegisters {
  coils?: Record<string, boolean>
  discrete_inputs?: Record<string, boolean>
  input_registers?: V1ServerRegister
  holding_registers?: V1ServerRegister
}

export type V1ServerRegistersPerUnit = Record<string, V1ServerRegisters | undefined>

export interface V1ServerConfig {
  name?: string
  serverRegistersPerUnit?: V1ServerRegistersPerUnit
}

/**
 * Extract global endianness from v1 server config with per-register endianness.
 * Uses majority voting. In case of tie, defaults to false (Big-Endian, Modbus standard).
 */
export function extractGlobalEndianness(serverRegistersPerUnit: V1ServerRegistersPerUnit): {
  endianness: boolean
  wasMixed: boolean
} {
  const counts = { little: 0, big: 0 }

  for (const serverRegisters of Object.values(serverRegistersPerUnit)) {
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
        if (entry.params.littleEndian === true) counts.little++
        else if (entry.params.littleEndian === false) counts.big++
      }
    }
  }

  // No registers found - default to Big-Endian
  if (counts.little === 0 && counts.big === 0) {
    return { endianness: false, wasMixed: false }
  }

  const wasMixed = counts.little > 0 && counts.big > 0
  // In case of tie, default to Big-Endian (Modbus standard)
  const endianness = counts.little > counts.big

  return { endianness, wasMixed }
}

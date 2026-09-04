import type { ZodError } from 'zod'
import { ParitySchema } from '../types/client'
import { RegisterAddressKeySchema, RegisterAddressSchema } from '../types/ranges'

/**
 * Replace a stored parity that `ParitySchema` no longer names, at `path` from
 * the root of a persisted blob.
 *
 * `mark` and `space` were offered until they were measured against the POSIX
 * serial binding, so a config written before that carries one. `repairPersisted`
 * works a top level field at a time, and without this the stored `mark` costs
 * the user the com port and the baud rate sitting beside it.
 */
export function repairPersistedParity(state: Record<string, unknown>, ...path: string[]): void {
  let options: unknown = state
  for (const key of path) {
    if (typeof options !== 'object' || options === null) return
    options = (options as Record<string, unknown>)[key]
  }
  if (typeof options !== 'object' || options === null) return

  const serialOptions = options as Record<string, unknown>
  if (serialOptions.parity === undefined) return
  if (ParitySchema.safeParse(serialOptions.parity).success) return

  serialOptions.parity = 'none'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The object values of `value`, and nothing at all when it is not an object. */
const objectValues = (value: unknown): Record<string, unknown>[] =>
  isRecord(value) ? Object.values(value).filter(isRecord) : []

/**
 * A register map is keyed by address, and a register entry repeats the address
 * in its parameters, so both have to be in the map for the entry to be. A
 * boolean entry carries the key alone.
 */
const isServable = (address: string, entry: Record<string, unknown>): boolean => {
  if (!RegisterAddressKeySchema.safeParse(address).success) return false
  const params = entry.params
  if (!isRecord(params)) return true
  return RegisterAddressSchema.safeParse(params.address).success
}

/**
 * Drop persisted registers at an address outside the 16 bit map.
 *
 * `RegisterParamsBasePartSchema.address` was a bare number until it was
 * measured against the remove channel, so a config file loaded before that
 * could put a register at 70000 and the store persisted it. `repairPersisted`
 * works a top level field at a time, and without this one such register costs
 * every register on every server and every unit.
 */
export function dropUnservableRegisters(state: Record<string, unknown>): void {
  for (const registersPerUnit of objectValues(state.serverRegisters)) {
    for (const registersByType of objectValues(registersPerUnit)) {
      for (const entriesByAddress of objectValues(registersByType)) {
        for (const [address, entry] of Object.entries(entriesByAddress)) {
          if (isRecord(entry) && isServable(address, entry)) continue
          delete entriesByAddress[address]
        }
      }
    }
  }
}

/**
 * Apply legacy string replacements (camelCase to snake_case)
 */
export function applyLegacyStringReplacements(content: string): string {
  return content
    .replaceAll('InputRegisters', 'input_registers')
    .replaceAll('DiscreteInputs', 'discrete_inputs')
    .replaceAll('Coils', 'coils')
    .replaceAll('HoldingRegisters', 'holding_registers')
}

/**
 * Format Zod validation errors into a readable summary.
 * Shows up to 5 issues with their path and message.
 */
export function formatZodError(error: ZodError): string {
  const issues = error.issues.slice(0, 5)
  const lines = issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `${path}: ${issue.message}`
  })
  const extra = error.issues.length > 5 ? `\n...and ${error.issues.length - 5} more` : ''
  return lines.join('\n') + extra
}

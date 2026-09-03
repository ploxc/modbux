import type { ZodError } from 'zod'
import { ParitySchema } from '../types/client'

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

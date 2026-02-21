import type { ZodError } from 'zod'

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

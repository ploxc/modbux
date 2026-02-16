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

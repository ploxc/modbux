import { formatUnixSeconds, parseIEC870DateTimeValue, ServerRegister, toExact64Bits } from '@shared'

/** What a server register's value cell shows. */
export const getDisplayValue = (register: ServerRegister[number]): string | number => {
  const { dataType } = register.params
  if (dataType === 'utf8') return register.params.stringValue ?? ''
  // A `unix` register is a uint32, so its composite is a number. The three
  // types that hold a string are read through `toExact64Bits`.
  if (dataType === 'unix') return formatUnixSeconds(Number(register.value))
  // The shared decoder answers '' for a register no date can be read out of,
  // which is what a register the server has not written yet holds.
  if (dataType === 'datetime') {
    const packed = toExact64Bits(register.value)
    return (packed !== undefined && parseIEC870DateTimeValue(packed)) || '—'
  }
  return register.value
}

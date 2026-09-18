import { IMask } from 'react-imask'

interface DecimalMask {
  mask: typeof IMask.MaskedNumber
  scale: number
  thousandsSeparator: string
  radix: string
  mapToRadix: string[]
}

/**
 * The mask a field takes when the value it carries may hold a fraction.
 *
 * `integerMask` is the other half, for a field whose value is always a whole
 * number. Here `integer` decides: `useMinMaxInteger` answers it true for the
 * seven integer data types and false for the rest, so a field bound to an
 * `int32` register refuses a separator and one bound to a `float` takes seven
 * digits after it.
 *
 * The five copies this replaces had already drifted. Four wrote
 * `scale: integer ? 0 : 7`; `interpolation.tsx` wrote no scale, so its four
 * fields ran on `IMask.MaskedNumber`'s default of 2 and dropped every digit
 * after the second.
 */
export const decimalMask = (integer: boolean): DecimalMask => ({
  mask: IMask.MaskedNumber,
  scale: integer ? 0 : 7,
  thousandsSeparator: '',
  radix: '.',
  mapToRadix: ['.', ',']
})

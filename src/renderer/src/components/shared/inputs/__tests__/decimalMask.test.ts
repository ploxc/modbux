// The five copies of this object had already drifted: four set
// `scale: integer ? 0 : 7` and `interpolation.tsx` set none, so its four fields
// ran on `IMask.MaskedNumber`'s default of 2. One function, and the scale is a
// thing a test can hold.
import { describe, expect, it } from 'vitest'
import { IMask } from 'react-imask'
import { decimalMask } from '../decimalMask'
import { integerMask } from '../integerMask'

describe('the decimal mask', () => {
  it('takes seven digits after the separator for a fractional type', () => {
    expect(decimalMask(false).scale).toBe(7)
  })

  it('takes none for an integer type, which is what integerMask says too', () => {
    expect(decimalMask(true).scale).toBe(0)
    expect(decimalMask(true).scale).toBe(integerMask.scale)
  })

  it('reads both separators as the radix, and prints the dot', () => {
    const { radix, mapToRadix, thousandsSeparator, mask } = decimalMask(false)

    expect(radix).toBe('.')
    expect(mapToRadix).toEqual(['.', ','])
    expect(thousandsSeparator).toBe('')
    expect(mask).toBe(IMask.MaskedNumber)
  })
})

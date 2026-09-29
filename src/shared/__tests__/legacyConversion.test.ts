// A mapping entry from before conversions carries `scalingFactor` and
// `interpolate`. It reads as the conversion that shows the same value.
import { describe, expect, it } from 'vitest'
import { RegisterMapObjectSchema } from '../types/client'

const read = (entry: unknown): unknown => RegisterMapObjectSchema.parse({ 0: entry })[0]

describe('a mapping entry from before conversions', () => {
  it('reads a scale factor as Scale', () => {
    expect(read({ dataType: 'uint16', scalingFactor: 0.1 })).toEqual({
      dataType: 'uint16',
      conversion: { kind: 'scale', factor: 0.1 }
    })
  })

  it('reads a factor of 1 as no conversion', () => {
    expect(read({ dataType: 'uint16', scalingFactor: 1 })).toEqual({ dataType: 'uint16' })
  })

  // It scaled, then interpolated, so the raw points are the old ones over the factor.
  it('reads an interpolation after a scale as Linear interpolation over raw points', () => {
    expect(
      read({
        dataType: 'uint16',
        scalingFactor: 0.1,
        interpolate: { x1: '0', x2: '100', y1: '4', y2: '20' }
      })
    ).toEqual({
      dataType: 'uint16',
      conversion: { kind: 'lerp', x1: '0', x2: '1000', y1: '4', y2: '20' }
    })
  })

  // The old modal's reset saved this line, which changes nothing.
  it('reads an interpolation that changes nothing as the scale alone', () => {
    const identity = { x1: '0', x2: '1', y1: '0', y2: '1' }
    expect(read({ dataType: 'float', interpolate: identity })).toEqual({ dataType: 'float' })
    expect(read({ dataType: 'uint16', scalingFactor: 0.1, interpolate: identity })).toEqual({
      dataType: 'uint16',
      conversion: { kind: 'scale', factor: 0.1 }
    })
  })

  it('keeps a conversion it already carries', () => {
    const conversion = { kind: 'script', code: 'return raw' }
    expect(read({ dataType: 'int16', conversion, scalingFactor: 5 })).toEqual({
      dataType: 'int16',
      conversion
    })
  })
})

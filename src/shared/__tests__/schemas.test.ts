import { describe, it, expect } from 'vitest'
import { RegisterMapObjectSchema } from '../types/client'
import { BitColorSchema, BitMapEntrySchema, BitMapConfigSchema } from '../types/bitmap'

describe('RegisterMapObjectSchema', () => {
  it('accepts numeric string keys', () => {
    const result = RegisterMapObjectSchema.safeParse({
      '0': { dataType: 'uint16' },
      '100': { dataType: 'int32' }
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-numeric string keys', () => {
    const result = RegisterMapObjectSchema.safeParse({
      abc: { dataType: 'uint16' }
    })
    expect(result.success).toBe(false)
  })

  // ! Coverage-only: trivial empty input, no real logic tested
  it('accepts empty object', () => {
    const result = RegisterMapObjectSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  // ! Coverage-only: trivial undefined value, no real logic tested
  it('accepts undefined values', () => {
    const result = RegisterMapObjectSchema.safeParse({
      '0': undefined
    })
    expect(result.success).toBe(true)
  })

  it('accepts register with bitMap config', () => {
    const result = RegisterMapObjectSchema.safeParse({
      '0': {
        dataType: 'bitmap',
        comment: 'status flags',
        bitMap: {
          '0': { comment: 'run', color: 'default' },
          '5': { comment: 'alarm', color: 'error', invert: true }
        }
      }
    })
    expect(result.success).toBe(true)
  })
})

describe('BitColorSchema', () => {
  it.each(['default', 'warning', 'error'])('accepts "%s"', (color) => {
    expect(BitColorSchema.safeParse(color).success).toBe(true)
  })

  it('rejects invalid color', () => {
    expect(BitColorSchema.safeParse('blue').success).toBe(false)
  })
})

describe('BitMapEntrySchema', () => {
  it('accepts empty entry', () => {
    expect(BitMapEntrySchema.safeParse({}).success).toBe(true)
  })

  it('accepts comment only', () => {
    expect(BitMapEntrySchema.safeParse({ comment: 'run' }).success).toBe(true)
  })

  it('accepts all fields', () => {
    const result = BitMapEntrySchema.safeParse({
      comment: 'alarm',
      color: 'error',
      invert: true
    })
    expect(result.success).toBe(true)
  })

  it('accepts color + invert without comment', () => {
    const result = BitMapEntrySchema.safeParse({ color: 'warning', invert: false })
    expect(result.success).toBe(true)
  })

  it('rejects invalid color value', () => {
    const result = BitMapEntrySchema.safeParse({ color: 'purple' })
    expect(result.success).toBe(false)
  })

  it('rejects non-boolean invert', () => {
    const result = BitMapEntrySchema.safeParse({ invert: 'yes' })
    expect(result.success).toBe(false)
  })
})

describe('BitMapConfigSchema', () => {
  it('accepts valid bit indices (0–15)', () => {
    const result = BitMapConfigSchema.safeParse({
      '0': { comment: 'first' },
      '15': { comment: 'last', color: 'warning', invert: true }
    })
    expect(result.success).toBe(true)
  })

  it('rejects bit index > 15', () => {
    const result = BitMapConfigSchema.safeParse({
      '16': { comment: 'out of range' }
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative bit index', () => {
    const result = BitMapConfigSchema.safeParse({
      '-1': { comment: 'negative' }
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-numeric bit index', () => {
    const result = BitMapConfigSchema.safeParse({
      abc: { comment: 'invalid key' }
    })
    expect(result.success).toBe(false)
  })

  it('accepts empty config', () => {
    expect(BitMapConfigSchema.safeParse({}).success).toBe(true)
  })
})

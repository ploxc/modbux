import { describe, it, expect } from 'vitest'
import { RegisterMapObjectSchema } from '../types/client'

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
})

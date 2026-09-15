import { describe, it, expect } from 'vitest'
import { DataTypeSchema, scalableDataTypes } from '../types/datatype'

// The types a scale and an interpolation do not apply to, written out rather
// than derived, so a new member of the enum lands in neither list and the
// test below says so.
const unscalableDataTypes = ['none', 'unix', 'datetime', 'utf8', 'bitmap']

describe('scalableDataTypes', () => {
  it('answers for every data type there is', () => {
    expect([...scalableDataTypes, ...unscalableDataTypes].sort()).toEqual(
      [...DataTypeSchema.options].sort()
    )
  })

  it('holds no duplicates', () => {
    expect(new Set(scalableDataTypes).size).toBe(scalableDataTypes.length)
  })
})

import { describe, it, expect } from 'vitest'
import { ConnectionConfigSchema, RegisterMapObjectSchema } from '../types/client'
import { defaultConnectionConfig } from '../default'
import { BitColorSchema, BitMapEntrySchema, BitMapConfigSchema } from '../types/bitmap'
import { RegisterParamsSchema } from '../types/server'

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

describe('Server RegisterParamsSchema — bitMap', () => {
  const baseParams = {
    address: 10,
    registerType: 'holding_registers',
    dataType: 'bitmap',
    comment: 'status word',
    value: 0
  }

  it('accepts bitmap register with bitMap config', () => {
    const result = RegisterParamsSchema.safeParse({
      ...baseParams,
      bitMap: {
        '0': { comment: 'run' },
        '5': { comment: 'alarm' }
      }
    })
    expect(result.success).toBe(true)
  })

  it('accepts bitmap register without bitMap config', () => {
    const result = RegisterParamsSchema.safeParse(baseParams)
    expect(result.success).toBe(true)
  })

  it('rejects bitMap with invalid bit index', () => {
    const result = RegisterParamsSchema.safeParse({
      ...baseParams,
      bitMap: { '16': { comment: 'out of range' } }
    })
    expect(result.success).toBe(false)
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

describe('ConnectionConfigSchema', () => {
  const withUnitId = (unitId: unknown): unknown => ({ ...defaultConnectionConfig, unitId })
  const withPort = (port: unknown): unknown => ({
    ...defaultConnectionConfig,
    tcp: {
      ...defaultConnectionConfig.tcp,
      options: { ...defaultConnectionConfig.tcp.options, port }
    }
  })

  it('accepts the config the app starts on', () => {
    expect(ConnectionConfigSchema.safeParse(defaultConnectionConfig).success).toBe(true)
  })

  it.each([0, 1, 255])('accepts unit id %s', (unitId) => {
    expect(ConnectionConfigSchema.safeParse(withUnitId(unitId)).success).toBe(true)
  })

  // 3.7 is in the list because `writeUInt8` truncates it to 3 rather than
  // throwing: an unchecked fractional id polls the wrong unit and says nothing.
  it.each([256, 999, -5, 3.7, Infinity])('refuses unit id %s', (unitId) => {
    expect(ConnectionConfigSchema.safeParse(withUnitId(unitId)).success).toBe(false)
  })

  it.each([0, 502, 65535])('accepts port %s', (port) => {
    expect(ConnectionConfigSchema.safeParse(withPort(port)).success).toBe(true)
  })

  it.each([65536, -1, 502.5])('refuses port %s', (port) => {
    expect(ConnectionConfigSchema.safeParse(withPort(port)).success).toBe(false)
  })

  // `update_connection_config` guards on the partial, which is the door a
  // renderer reaches. Both ranges have to survive `deepPartial`.
  it('carries both ranges into the partial the ipc channel guards on', () => {
    const partial = ConnectionConfigSchema.deepPartial()

    expect(partial.safeParse({ unitId: 255 }).success).toBe(true)
    expect(partial.safeParse({ unitId: 999 }).success).toBe(false)
    expect(partial.safeParse({ tcp: { options: { port: 502 } } }).success).toBe(true)
    expect(partial.safeParse({ tcp: { options: { port: 65536 } } }).success).toBe(false)
  })
})

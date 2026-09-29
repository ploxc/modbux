// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { ClientUnit, emptyLogStatus, LogSample, newClientUnit } from '@shared'
import { DateTime } from 'luxon'
import { csvField, csvHead, csvLine } from '../logCsv'

const time = DateTime.fromISO('2026-09-29T14:02:11.250').toMillis()

const meter = (): ClientUnit => {
  const unit = newClientUnit('meter', 2)
  unit.name = 'Energy meter'
  unit.addressBase = '1'
  unit.registerMapping.holding_registers = {
    3000: {
      dataType: 'uint16',
      comment: 'Current, L1',
      unit: 'A',
      conversion: { kind: 'scale', factor: 0.1 },
      log: { mode: 'poll' }
    }
  }
  unit.registerMapping.coils = { 4: { comment: 'Pump', log: { mode: 'poll' } } }
  return unit
}

const sample = (fields: Partial<LogSample>): LogSample => ({
  unit: 'meter',
  type: 'holding_registers',
  address: 3000,
  time,
  value: 125,
  error: undefined,
  ...fields
})

describe('a CSV line', () => {
  it('carries the raw value and the value as its conversion makes it', () => {
    expect(csvLine(sample({}), meter())).toBe(
      '2026-09-29 14:02:11.250,2,Energy meter,holding_registers,3001,"Current, L1",125,12.5,A,ok'
    )
  })

  it('gives a bit its 0 or 1 in both columns', () => {
    expect(csvLine(sample({ type: 'coils', address: 4, value: 1 }), meter())).toBe(
      '2026-09-29 14:02:11.250,2,Energy meter,coils,5,Pump,1,1,,ok'
    )
  })

  it('leaves both values empty for a failed read, and says why', () => {
    expect(csvLine(sample({ value: NaN, error: 'Timed out' }), meter())).toBe(
      '2026-09-29 14:02:11.250,2,Energy meter,holding_registers,3001,"Current, L1",,,A,Timed out'
    )
  })

  it('writes what it holds of a unit removed since', () => {
    expect(csvLine(sample({ unit: 'gone' }), undefined)).toBe(
      '2026-09-29 14:02:11.250,,,holding_registers,3000,,125,125,,ok'
    )
  })
})

describe('a CSV field', () => {
  it('is quoted when it holds a comma, a quote or a line break', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a, b')).toBe('"a, b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
  })
})

describe('the head of a CSV', () => {
  it('names the client, and from when the log is complete', () => {
    const status = { ...emptyLogStatus(), oldest: time, overwritten: 42 }
    expect(csvHead('Meter bus', '127.0.0.1:502', status)).toEqual([
      '# Modbux log of Meter bus, 127.0.0.1:502',
      '# Complete from 2026-09-29 14:02:11.250; 42 samples before it were overwritten',
      'time,unit_id,unit,register_type,address,name,raw,value,engineering_unit,status'
    ])
  })
})

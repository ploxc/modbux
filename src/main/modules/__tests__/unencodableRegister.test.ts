// The three doors `AUDIT-clusters.md` names as still reaching `addRegister`
// after the schema was tightened: the add dialog, a repaired persisted store,
// and the width overflow. All three arrive on a guarded channel, so this asks
// the two schemas `main/ipc.ts` guards with whether they still let the input
// through that `createRegisters` and `createStringRegisters` throw on.
import { describe, expect, it } from 'vitest'
import { AddRegisterParamsSchema, SyncRegisterValueParamsSchema } from '@shared'

const params = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  address: 0,
  registerType: 'holding_registers',
  dataType: 'uint16',
  comment: '',
  value: 1,
  ...overrides
})

const addTakes = (overrides: Record<string, unknown>): boolean =>
  AddRegisterParamsSchema.safeParse({ uuid: 'u', unitId: '1', params: params(overrides) }).success

const syncTakes = (overrides: Record<string, unknown>): boolean =>
  SyncRegisterValueParamsSchema.safeParse({
    uuid: 'u',
    unitId: '1',
    registerValues: [params(overrides)]
  }).success

describe('the register main cannot encode', () => {
  const unencodable: [string, Record<string, unknown>][] = [
    ['a uint16 of 70000', { value: 70000 }],
    ['an int16 of 40000', { dataType: 'int16', value: 40000 }],
    ['an int64 of 1.5', { dataType: 'int64', value: 1.5 }],
    ['a string of 1e12 words', { dataType: 'utf8', length: 1e12, stringValue: 'x', value: 0 }],
    ['a string of 1e9 words', { dataType: 'utf8', length: 1e9, stringValue: 'x', value: 0 }],
    [
      'a string of ten at 65530',
      { address: 65530, dataType: 'utf8', length: 10, stringValue: 'x', value: 0 }
    ],
    ['an interval of 1e12', { interval: 1e12, min: 0, max: 10, value: undefined }]
  ]

  it.each(unencodable)('is refused on add before main sees it: %s', (_name, overrides) => {
    expect(addTakes(overrides)).toBe(false)
  })

  it.each(unencodable)('is refused on sync before main sees it: %s', (_name, overrides) => {
    expect(syncTakes(overrides)).toBe(false)
  })

  it('still takes the registers the app sends', () => {
    expect(addTakes({})).toBe(true)
    expect(addTakes({ dataType: 'utf8', length: 10, stringValue: 'hello', value: 0 })).toBe(true)
    expect(addTakes({ interval: 1000, min: 0, max: 10, value: undefined })).toBe(true)
  })
})

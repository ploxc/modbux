// @vitest-environment happy-dom
//
// `resetBools` and `syncBoolsWithBackend` each built two arrays of 65536 from
// one unit's map, and they are one helper now. Main writes both arrays by
// index on every sync, so the type that is not being cleared has to arrive
// carrying what it had: a helper that answered the cleared pair twice would
// blank the other half of the unit and nothing on screen would say so.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_SERVER_UUID, type SyncBoolsParameters } from '@shared'
import { recordApiCalls, stubRenderer, type ApiCall } from './stubRenderer'

let calls: ApiCall[]

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
  calls = []
})

/** The payload of the last `syncBools`, typed, so the test can index it. */
const lastSync = (): SyncBoolsParameters => {
  const payload = calls.filter((call) => call.method === 'syncBools').at(-1)?.payload
  if (payload === undefined) throw new Error('nothing called syncBools')
  return payload as SyncBoolsParameters
}

describe('clearing one boolean type', () => {
  it('empties that type and leaves the other one standing', async () => {
    const { useServerZustand } = await import('../server.zustand')
    const serverZustand = useServerZustand.getState()
    serverZustand.addBool('coils', 3)
    serverZustand.setBool({ registerType: 'coils', address: 3, boolState: true })
    serverZustand.addBool('discrete_inputs', 7)
    serverZustand.setBool({ registerType: 'discrete_inputs', address: 7, boolState: true })
    recordApiCalls(calls)

    useServerZustand.getState().resetBools('coils')

    const unit = useServerZustand.getState().serverRegisters[MAIN_SERVER_UUID]?.['0']
    expect(unit?.coils).toEqual({})
    expect(unit?.discrete_inputs?.[7]?.value).toBe(true)
  })

  it('sends main a blank array for it and the values for the other', async () => {
    const { useServerZustand } = await import('../server.zustand')
    const serverZustand = useServerZustand.getState()
    serverZustand.addBool('coils', 3)
    serverZustand.setBool({ registerType: 'coils', address: 3, boolState: true })
    serverZustand.addBool('discrete_inputs', 7)
    serverZustand.setBool({ registerType: 'discrete_inputs', address: 7, boolState: true })
    recordApiCalls(calls)

    useServerZustand.getState().resetBools('coils')

    const sent = lastSync()
    expect(sent.coils).toHaveLength(65536)
    expect(sent.coils.some((value) => value)).toBe(false)
    expect(sent.discrete_inputs[7]).toBe(true)
    expect(sent.discrete_inputs.filter((value) => value)).toHaveLength(1)
  })
})

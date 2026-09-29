// @vitest-environment happy-dom
//
// Enabling the log puts read configuration on for every unit of the client
// before main hears of the log, because Debug shows Monitor's reads while the
// log is on.
import { describe, expect, it, vi } from 'vitest'
// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { ApiCall, recordApiCalls } from '@renderer/context/__tests__/stubRenderer'
import { useClientZustand } from '@renderer/context/client.zustand'
import { enableLog } from '../enableLog'

describe('enableLog', () => {
  it('puts read configuration on for every unit, then starts the log', async () => {
    const calls: ApiCall[] = []
    recordApiCalls(calls)
    const clientZustand = useClientZustand.getState()
    await clientZustand.addUnit()
    const uuid = useClientZustand.getState().selectedUuid
    const units = useClientZustand.getState().clients[uuid]?.units.map(({ uuid }) => uuid) ?? []
    expect(units).toHaveLength(2)

    enableLog(uuid, true)

    const session = useClientZustand.getState().sessions[uuid]
    expect(units.map((unit) => session?.readConfiguration[unit])).toEqual([true, true])
    expect(
      calls
        .filter(({ method }) => method === 'setReadConfiguration' || method === 'startLog')
        .map(({ method, payload }) => [method, payload])
    ).toEqual([
      ...units.map((unit) => ['setReadConfiguration', { uuid, unit, readConfiguration: true }]),
      ['startLog', { uuid, append: true }]
    ])
  })
})

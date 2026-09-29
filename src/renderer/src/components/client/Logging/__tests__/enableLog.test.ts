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

import { ApiCall, fireEvent, recordApiCalls } from '@renderer/context/__tests__/stubRenderer'
import { defaultClientState } from '@shared'
import '@renderer/context/live.zustand'
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

  const loggingState = {
    ...defaultClientState,
    log: { ...defaultClientState.log, enabled: true }
  }

  it('turns read configuration on for a unit added while logging is on', async () => {
    const uuid = useClientZustand.getState().selectedUuid
    fireEvent('client_state', { uuid, clientState: loggingState })

    await useClientZustand.getState().addUnit()

    const added = useClientZustand.getState().clients[uuid]?.units.at(-1)?.uuid ?? ''
    expect(useClientZustand.getState().sessions[uuid]?.readConfiguration[added]).toBe(true)
  })

  it('leaves a unit added while logging is off without it', async () => {
    const uuid = useClientZustand.getState().selectedUuid
    fireEvent('client_state', { uuid, clientState: defaultClientState })

    await useClientZustand.getState().addUnit()

    const added = useClientZustand.getState().clients[uuid]?.units.at(-1)?.uuid ?? ''
    expect(useClientZustand.getState().sessions[uuid]?.readConfiguration[added]).toBeFalsy()
  })

  // A register scan turns it off on purpose, and main's state keeps coming
  // while logging is on.
  it('leaves read configuration off where it was turned off while logging', () => {
    const uuid = useClientZustand.getState().selectedUuid
    fireEvent('client_state', { uuid, clientState: loggingState })
    useClientZustand.getState().setReadConfiguration(false)
    const unit = useClientZustand.getState().sessions[uuid]?.selectedUnit ?? ''

    fireEvent('client_state', { uuid, clientState: loggingState })

    expect(useClientZustand.getState().sessions[uuid]?.readConfiguration[unit]).toBe(false)
  })
})

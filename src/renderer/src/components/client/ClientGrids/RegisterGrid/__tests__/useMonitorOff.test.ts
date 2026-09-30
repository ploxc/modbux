// @vitest-environment happy-dom
//
// While logging, Debug greys the rows of a group Monitor does not read. Each
// group walks the whole mapping to decide, so the groups are found when the
// mapping changes, not on every render of the grid or every change of the
// store, and not at all while logging is off.
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

// Counts how often the groups are found, which is the work this saves.
vi.mock('@shared', async (importOriginal) => {
  const shared = await importOriginal<typeof import('@shared')>()
  return { ...shared, configuredReadGroups: vi.fn(shared.configuredReadGroups) }
})

import { act, renderHook } from '@testing-library/react'
import { patchSelectedUnit } from '@renderer/context/__tests__/selectedClient'
import { patchShownData } from '@renderer/context/__tests__/shownData'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { configuredReadGroups, defaultClientState, emptyRegisterMapping } from '@shared'
import { useMonitorOff } from '../useMonitorOff'

/** Holding 0 polls in Monitor; holding 200, a group of its own, does not. */
const mapTwoGroups = (pollOff = true): void => {
  const registerMapping = emptyRegisterMapping()
  registerMapping.holding_registers = {
    0: { dataType: 'uint16' },
    200: { dataType: 'uint16', monitorPollOff: pollOff }
  }
  patchSelectedUnit(useClientZustand, { registerMapping })
}

const logging = (enabled: boolean): void =>
  patchShownData(useLiveZustand, {
    clientState: { ...defaultClientState, log: { ...defaultClientState.log, enabled } }
  })

/** Renders of the grid, and changes of the store that leave the mapping alone. */
const renderAndChangeTheStore = (rerender: () => void): void => {
  for (let i = 0; i < 5; i++) {
    rerender()
    act(() => useClientZustand.setState({}))
  }
}

beforeEach(() => {
  mapTwoGroups()
  vi.mocked(configuredReadGroups).mockClear()
})

describe('the rows Monitor does not read', () => {
  it('are the addresses of a group whose Poll is off, while logging', () => {
    logging(true)

    const { result } = renderHook(() => useMonitorOff('holding_registers'))

    expect([...result.current]).toEqual([200])
  })

  it('follow the mapping when a Poll is turned on', () => {
    logging(true)
    const { result } = renderHook(() => useMonitorOff('holding_registers'))

    act(() => mapTwoGroups(false))

    expect([...result.current]).toEqual([])
  })

  it('are found once over renders and store changes that leave the mapping alone', () => {
    logging(true)
    const { rerender } = renderHook(() => useMonitorOff('holding_registers'))
    const found = vi.mocked(configuredReadGroups).mock.calls.length

    renderAndChangeTheStore(rerender)

    expect(found).toBe(1)
    expect(vi.mocked(configuredReadGroups).mock.calls.length).toBe(found)
  })

  it('are not looked for while logging is off', () => {
    logging(false)
    const { rerender, result } = renderHook(() => useMonitorOff('holding_registers'))

    renderAndChangeTheStore(rerender)

    expect(vi.mocked(configuredReadGroups).mock.calls.length).toBe(0)
    expect([...result.current]).toEqual([])
  })
})

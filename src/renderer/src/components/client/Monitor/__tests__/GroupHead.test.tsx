// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// A group's head reads that group alone, switches Poll for its own unit, and
// takes Debug to its unit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { ApiCall, recordApiCalls } from '@renderer/context/__tests__/stubRenderer'
import { patchShownData } from '@renderer/context/__tests__/shownData'
import { useClientZustand } from '@renderer/context/client.zustand'
import { selectedClient, selectedUnit } from '@renderer/context/client.zustand.helpers'
import { useClientViewZustand } from '@renderer/context/clientView.zustand'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { ClientState, defaultClientState } from '@shared'
import GroupHead from '../GroupHead'
import type { MonitorHeadRow } from '../monitorRows'

let calls: ApiCall[] = []

/** A unit added beside the one the store starts with, which Debug keeps selected. */
const secondUnit = async (): Promise<string> => {
  const first = selectedUnit(useClientZustand.getState()).uuid
  await useClientZustand.getState().addUnit()
  const second = selectedUnit(useClientZustand.getState()).uuid
  useClientZustand.getState().selectUnit(first)
  return second
}

const renderHead = (unit: string, clientState: Partial<ClientState> = {}): void => {
  patchShownData(useLiveZustand, {
    clientState: { ...defaultClientState, connectState: 'connected', ...clientState }
  })
  const row: MonitorHeadRow = {
    kind: 'head',
    id: 'head',
    unit,
    type: 'holding_registers',
    group: [200, 4]
  }
  render(<GroupHead row={row} />)
}

/** The testid of the head's control named `control`, for the unit under `unit`. */
const control = (unit: string, name: string): HTMLElement => {
  const unitId = selectedClient(useClientZustand.getState()).units.find(
    ({ uuid }) => uuid === unit
  )?.unitId
  return screen.getByTestId(`monitor-group-${unitId}-holding_registers-200-${name}`)
}

afterEach(cleanup)

beforeEach(() => {
  calls = []
  recordApiCalls(calls)
  useClientViewZustand.getState().setView('monitor')
})

describe("a group's head", () => {
  it('reads that group alone when READ is pressed', async () => {
    const unit = await secondUnit()
    renderHead(unit)

    await userEvent.setup().click(control(unit, 'read'))

    expect(
      calls.filter(({ method }) => method === 'readGroup').map(({ payload }) => payload)
    ).toEqual([
      {
        uuid: useClientZustand.getState().selectedUuid,
        unit,
        type: 'holding_registers',
        group: [200, 4]
      }
    ])
  })

  it('takes no READ while a poll runs', async () => {
    const unit = await secondUnit()
    renderHead(unit, { polling: true })

    expect(control(unit, 'read')).toBeDisabled()
  })

  it('switches Poll for its own unit, not the one Debug shows', async () => {
    const unit = await secondUnit()
    const polledOf = (): Array<[string, boolean]> =>
      selectedClient(useClientZustand.getState()).units.map(({ uuid, sections }) => [
        uuid,
        sections.holding_registers.polled
      ])
    const expected = polledOf().map(([uuid, polled]): [string, boolean] => [
      uuid,
      uuid === unit ? !polled : polled
    ])
    renderHead(unit)

    await userEvent.setup().click(control(unit, 'poll'))

    await waitFor(() => expect(polledOf()).toEqual(expected))
  })

  it('takes Debug to its unit on Show unit', async () => {
    const unit = await secondUnit()
    renderHead(unit)

    await userEvent.setup().click(control(unit, 'show-unit'))

    expect(useClientViewZustand.getState().view).toBe('debug')
    expect(selectedUnit(useClientZustand.getState()).uuid).toBe(unit)
  })
})

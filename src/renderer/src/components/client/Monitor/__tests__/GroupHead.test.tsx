// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// A group's head reads that group alone, switches Poll for its own group, and
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

const shownUuid = (): string => useClientZustand.getState().selectedUuid

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

  describe('Poll', () => {
    /**
     * The holding registers of the unit under `unit`: 200 and 202 in the group
     * of [200, 4], and 204 just past it.
     */
    const mapTwo = (unit: string, off: { 200?: boolean; 202?: boolean } = {}): void => {
      useClientZustand.setState((state) => {
        const found = state.clients[state.selectedUuid]?.units.find(({ uuid }) => uuid === unit)
        if (!found) throw new Error(`no unit ${unit}`)
        found.registerMapping.holding_registers = {
          200: { dataType: 'uint16', monitorPollOff: off[200] },
          202: { dataType: 'float', monitorPollOff: off[202] },
          204: { dataType: 'uint16' }
        }
      })
    }

    /** Which of 200, 202 and 204 have Poll off in the unit under `unit`. */
    const offOf = (unit: string): unknown[] => {
      const mapping = selectedClient(useClientZustand.getState()).units.find(
        ({ uuid }) => uuid === unit
      )?.registerMapping.holding_registers
      return [200, 202, 204].map((address) => mapping?.[address]?.monitorPollOff)
    }

    const pollSwitch = (unit: string): HTMLInputElement =>
      control(unit, 'poll').querySelector('input') ?? screen.getByRole('switch')

    it('turns every register of its group off, in its own unit only', async () => {
      const first = selectedUnit(useClientZustand.getState()).uuid
      const unit = await secondUnit()
      mapTwo(first)
      mapTwo(unit)
      renderHead(unit)

      expect(pollSwitch(unit)).toBeChecked()
      await userEvent.setup().click(pollSwitch(unit))

      await waitFor(() => expect(offOf(unit)).toEqual([true, true, undefined]))
      expect(offOf(first)).toEqual([undefined, undefined, undefined])
      expect(pollSwitch(unit)).not.toBeChecked()
    })

    it('turns them all on again', async () => {
      const unit = await secondUnit()
      mapTwo(unit, { 200: true, 202: true })
      renderHead(unit)

      expect(pollSwitch(unit)).not.toBeChecked()
      await userEvent.setup().click(pollSwitch(unit))

      await waitFor(() => expect(offOf(unit)).toEqual([undefined, undefined, undefined]))
    })

    /** 200 logging on every poll, in the unit under `unit`. */
    const log200 = (unit: string): void => {
      useClientZustand.setState((state) => {
        const found = state.clients[state.selectedUuid]?.units.find(({ uuid }) => uuid === unit)
        const entry = found?.registerMapping.holding_registers[200]
        if (!entry) throw new Error('no register 200')
        entry.log = { mode: 'poll' }
      })
    }
    const logging = { log: { ...defaultClientState.log, enabled: true } }

    it('is held on and greyed while logging, off or not, with the Log icon', async () => {
      const unit = await secondUnit()
      mapTwo(unit, { 200: true, 202: true })
      log200(unit)
      renderHead(unit, logging)

      expect(pollSwitch(unit)).toBeChecked()
      expect(pollSwitch(unit)).toBeDisabled()
      expect(control(unit, 'logs')).toBeInTheDocument()
    })

    it('takes a press while logging when no register of the group logs', async () => {
      const unit = await secondUnit()
      mapTwo(unit)
      renderHead(unit, logging)

      expect(pollSwitch(unit)).toBeEnabled()
    })

    it('takes a press with a register that logs while logging is off', async () => {
      const unit = await secondUnit()
      mapTwo(unit)
      log200(unit)
      renderHead(unit)

      expect(pollSwitch(unit)).toBeEnabled()
    })

    it('stands on with some registers off, says so, and turns all off on a press', async () => {
      const unit = await secondUnit()
      mapTwo(unit, { 202: true })
      renderHead(unit)

      expect(pollSwitch(unit)).toBeChecked()
      expect(screen.getByTitle('Some registers are off')).toBeInTheDocument()
      await userEvent.setup().click(pollSwitch(unit))

      await waitFor(() => expect(offOf(unit)).toEqual([true, true, undefined]))
    })
  })

  it('takes Debug to its unit and type, with the group as its window, on Show unit', async () => {
    const unit = await secondUnit()
    renderHead(unit)

    await userEvent.setup().click(control(unit, 'show-unit'))

    await waitFor(() => expect(useClientViewZustand.getState().view).toBe('debug'))
    const shown = selectedUnit(useClientZustand.getState())
    expect(shown.uuid).toBe(unit)
    expect(shown.sections.holding_registers).toMatchObject({ address: 200, length: 4 })
    expect(useClientZustand.getState().sessions[shownUuid()]?.shownType).toBe('holding_registers')
  })
})

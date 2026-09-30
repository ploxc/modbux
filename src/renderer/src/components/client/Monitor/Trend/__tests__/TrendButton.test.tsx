// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// A row's Log icon adds its register to the trend, and takes it out again
// while the open trend draws it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useClientZustand } from '@renderer/context/client.zustand'
import { selectedUnit } from '@renderer/context/client.zustand.helpers'
import type { MonitorRegisterRow } from '../../monitorRows'
import TrendButton from '../TrendButton'
import { trendKey, useTrendPanelZustand } from '../trendPanel.zustand'

const TEST_ID = 'monitor-trend-icon'

const rowAt = (address: number): MonitorRegisterRow => ({
  kind: 'register',
  id: `row-${address}`,
  unit: selectedUnit(useClientZustand.getState()).uuid,
  type: 'holding_registers',
  address,
  group: [0, 10]
})

const keyOf = (row: MonitorRegisterRow): string =>
  trendKey({
    uuid: useClientZustand.getState().selectedUuid,
    unit: row.unit,
    type: row.type,
    address: row.address
  })

const drawnKeys = (): string[] => useTrendPanelZustand.getState().entries.map(trendKey)

afterEach(cleanup)

beforeEach(() => {
  // Logging, so the prune before each add keeps them.
  useClientZustand.setState((state) => {
    const unit = state.clients[state.selectedUuid]?.units[0]
    if (!unit) throw new Error('the client store starts with no unit')
    unit.registerMapping.holding_registers = {
      3: { dataType: 'int16', log: { mode: 'poll' } },
      5: { dataType: 'int16', log: { mode: 'poll' } }
    }
  })
  useTrendPanelZustand.setState({
    uuid: '',
    entries: [],
    anchor: null,
    view: undefined,
    room: document.createElement('div'),
    mode: 'float'
  })
})

describe("a row's Log icon", () => {
  it('adds its register and opens the trend on it', async () => {
    const row = rowAt(3)
    render(<TrendButton row={row} testId={TEST_ID} />)

    await userEvent.setup().click(screen.getByTestId(TEST_ID))

    expect(drawnKeys()).toEqual([keyOf(row)])
    expect(useTrendPanelZustand.getState().anchor).not.toBeNull()
    expect(screen.getByTestId(TEST_ID)).toHaveAttribute('aria-pressed', 'true')
  })

  it('takes its register out while the open trend draws it, and leaves the others', async () => {
    const row = rowAt(3)
    const other = rowAt(5)
    render(
      <>
        <TrendButton row={row} testId={TEST_ID} />
        <TrendButton row={other} testId="monitor-trend-other" />
      </>
    )
    const user = userEvent.setup()
    await user.click(screen.getByTestId(TEST_ID))
    await user.click(screen.getByTestId('monitor-trend-other'))

    await user.click(screen.getByTestId(TEST_ID))

    expect(drawnKeys()).toEqual([keyOf(other)])
    expect(useTrendPanelZustand.getState().anchor).not.toBeNull()
    expect(screen.getByTestId(TEST_ID)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId(TEST_ID)).toHaveAccessibleName('Add to the trend')
  })

  it('opens a closed trend that kept its register, rather than taking it out', async () => {
    const row = rowAt(3)
    render(<TrendButton row={row} testId={TEST_ID} />)
    const user = userEvent.setup()
    await user.click(screen.getByTestId(TEST_ID))
    useTrendPanelZustand.getState().close()

    await user.click(screen.getByTestId(TEST_ID))

    expect(drawnKeys()).toEqual([keyOf(row)])
    expect(useTrendPanelZustand.getState().anchor).not.toBeNull()
  })
})

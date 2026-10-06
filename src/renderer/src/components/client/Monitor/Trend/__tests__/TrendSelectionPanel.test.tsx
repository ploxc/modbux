// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { cleanup, render, screen } from '@testing-library/react'
import type { LogPage } from '@shared'
import TrendSelectionPanel, { SelectionRegister } from '../TrendSelectionPanel'
import { DrawnEntry, trendKey } from '../trendPanel.zustand'

const ENTRY: DrawnEntry = {
  uuid: 'client-a',
  unit: 'unit-1',
  type: 'holding_registers',
  address: 8,
  color: '#fff'
}
const SELECTION = { from: 0, to: 100 }
const RUN_ENDS: number[] = []
const ENTRIES = [ENTRY]

const page = (values: number[]): LogPage => ({
  samples: values.map((value, index) => ({
    unit: ENTRY.unit,
    type: ENTRY.type,
    address: ENTRY.address,
    time: index * 10,
    value,
    error: undefined
  })),
  next: undefined
})

/** Answers `getLogPage` with `answer`, every other channel as the stub does. */
const answerPages = (answer: () => LogPage): void => {
  const stubbed = window.api as unknown as Record<string, unknown>
  window.api = new Proxy({} as typeof window.api, {
    get: (_target, method: string): unknown =>
      method === 'getLogPage' ? async (): Promise<LogPage> => answer() : stubbed[method]
  })
}

const registerWith = (convert: (raw: number) => number): SelectionRegister => ({
  key: trendKey(ENTRY),
  testId: 'trend-selection-row-holding_registers-8',
  label: '8 Setpoint',
  color: '#fff',
  unit: 'V',
  hidden: false,
  convert
})

let original: typeof window.api

beforeEach(() => {
  original = window.api
})

afterEach(() => {
  cleanup()
  window.api = original
})

describe('the selection panel', () => {
  it('reads the samples once, however often the trend renders it again', async () => {
    answerPages(() => page([230, 231, 229]))
    const convert = vi.fn((raw: number) => raw)
    const registers = [registerWith(convert)]
    const panel = (): JSX.Element => (
      <TrendSelectionPanel
        uuid="client-a"
        entries={ENTRIES}
        registers={registers}
        selection={SELECTION}
        runEnds={RUN_ENDS}
        onZoom={(): void => {}}
      />
    )
    const { rerender } = render(panel())
    expect(await screen.findByText('230 V')).toBeInTheDocument()
    const read = convert.mock.calls.length

    for (let render = 0; render < 3; render++) rerender(panel())

    expect(convert.mock.calls.length).toBe(read)
  })

  it('reads them again for registers of another conversion', async () => {
    answerPages(() => page([10, 20]))
    const render1 = render(
      <TrendSelectionPanel
        uuid="client-a"
        entries={ENTRIES}
        registers={[registerWith((raw) => raw)]}
        selection={SELECTION}
        runEnds={RUN_ENDS}
        onZoom={(): void => {}}
      />
    )
    expect(await screen.findByText('15 V')).toBeInTheDocument()

    render1.rerender(
      <TrendSelectionPanel
        uuid="client-a"
        entries={ENTRIES}
        registers={[registerWith((raw) => raw * 2)]}
        selection={SELECTION}
        runEnds={RUN_ENDS}
        onZoom={(): void => {}}
      />
    )
    expect(await screen.findByText('30 V')).toBeInTheDocument()
  })
})

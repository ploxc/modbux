// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The dialog lists the series of the selected client's log, and exports
// nothing of a client it is no longer showing.
import { afterEach, describe, expect, it, vi } from 'vitest'
// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { act, cleanup, render, screen } from '@testing-library/react'
import { useClientZustand } from '@renderer/context/client.zustand'
import { LogSeries } from '@shared'
import ExportLogDialog from '../ExportLogDialog'

afterEach(cleanup)

const series: LogSeries = { unit: 'meter', type: 'holding_registers', address: 3000 }

/** `getLogSeries` answering each call when the test says, and the rest as the stub does. */
const answerSeriesByHand = (): ((answer: LogSeries[]) => void)[] => {
  const pending: ((answer: LogSeries[]) => void)[] = []
  const stubbed = window.api as unknown as Record<string, unknown>
  window.api = new Proxy(
    {},
    {
      get: (_target, method: string): unknown =>
        method === 'getLogSeries'
          ? (): Promise<LogSeries[]> => new Promise((resolve) => pending.push(resolve))
          : stubbed[method]
    }
  ) as typeof window.api
  return pending
}

/** Hands the `index`th `getLogSeries` call its answer. */
const answer = async (
  pending: ((answer: LogSeries[]) => void)[],
  index: number,
  series: LogSeries[]
): Promise<void> => {
  const resolve = pending[index]
  if (resolve === undefined) throw new Error(`getLogSeries was asked ${pending.length} times`)
  await act(async () => resolve(series))
}

describe('ExportLogDialog', () => {
  it('asks again for another client, and exports nothing until it answers', async () => {
    const pending = answerSeriesByHand()
    render(<ExportLogDialog onClose={vi.fn()} />)
    await answer(pending, 0, [series])
    expect(screen.getByTestId('log-export-btn')).toBeEnabled()

    act(() => useClientZustand.setState({ selectedUuid: 'another-client' }))

    expect(pending).toHaveLength(2)
    expect(screen.getByTestId('log-export-btn')).toBeDisabled()
    await answer(pending, 1, [series])
    expect(screen.getByTestId('log-export-btn')).toBeEnabled()
  })
})

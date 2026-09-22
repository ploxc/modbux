// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Both root stores register IPC listeners and run init() at import time.
vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: { on: () => () => {}, send: () => {}, invoke: async () => undefined }
  }
  w.api = new Proxy({}, { get: () => () => Promise.resolve(undefined) })
})

// The indicator itself draws a Paper, a TextField and a Popover per bit. What
// this file measures is how many of them React renders, so the real `meme`
// wraps a body that counts and draws nothing.
const { rendered } = vi.hoisted(() => ({ rendered: [] as number[] }))
vi.mock('../BitIndicator', async () => {
  const { meme } = await import('@renderer/components/shared/inputs/meme')
  return {
    default: meme(({ bitIndex }: { bitIndex: number }) => {
      rendered.push(bitIndex)
      return null
    })
  }
})

import { act, render } from '@testing-library/react'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useDataZustand } from '@renderer/context/data.zustand'
import { defaultClientState, RegisterData } from '@shared'
import BitMapDetailPanel from '../BitMapDetailPanel'

const row = (uint16: number): RegisterData =>
  ({
    id: 0,
    buffer: new Uint8Array(2),
    hex: uint16.toString(16).padStart(4, '0'),
    words: { uint16 },
    bit: false,
    isScanned: false
  }) as unknown as RegisterData

const poll = (uint16: number): void => {
  act(() => {
    useDataZustand.setState({ registerData: [row(uint16)] })
  })
}

beforeEach(() => {
  rendered.length = 0
  useDataZustand.setState({ clientState: { ...defaultClientState, connectState: 'connected' } })
  useClientZustand.setState({
    ready: true,
    registerConfig: { ...useClientZustand.getState().registerConfig, type: 'holding_registers' }
  } as never)
  useDataZustand.setState({ registerData: [row(0)] })
})

// `meme` is `memo` with `deepEqual`, which compares a function by identity. An
// arrow built in the panel's JSX is a new one every render, so all sixteen
// indicators redrew on every poll.
describe('BitMapDetailPanel and what a poll redraws', () => {
  it('draws every bit once on mount', () => {
    render(<BitMapDetailPanel address={0} />)

    expect(rendered.length).toBe(16)
  })

  it('redraws nothing when the word comes back the same', () => {
    render(<BitMapDetailPanel address={0} />)
    rendered.length = 0

    poll(0)

    expect(rendered).toEqual([])
  })

  it('redraws the one bit that changed', () => {
    render(<BitMapDetailPanel address={0} />)
    rendered.length = 0

    poll(0b100)

    expect(rendered).toEqual([2])
  })

  it('redraws every bit that changed and no other', () => {
    render(<BitMapDetailPanel address={0} />)
    rendered.length = 0

    poll(0b1000000000000101)

    expect(rendered.sort((a, b) => a - b)).toEqual([0, 2, 15])
  })
})

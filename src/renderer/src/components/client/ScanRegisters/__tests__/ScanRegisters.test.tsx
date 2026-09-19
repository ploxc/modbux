// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The root store registers IPC listeners (window.electron.ipcRenderer) and runs
// init() (window.api.*) at import time. Stub both before the store is imported,
// and keep the one channel this file reads back.
const stub = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const scanRegisters = vi.fn()
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: { on: () => () => {}, send: () => {}, invoke: async () => undefined }
  }
  w.api = new Proxy(
    { scanRegisters },
    { get: (target, name) => Reflect.get(target, name) ?? (() => Promise.resolve(undefined)) }
  )
  return { scanRegisters }
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useClientZustand } from '@renderer/context/client.zustand'
import { defaultClientState, ScanRegistersParametersSchema } from '@shared'
import ScanRegisters from '../ScanRegisters'
import { useScanRegistersZustand } from '../scanRegisters.zustand'

const payload = async (): Promise<unknown> => {
  await waitFor(() => expect(stub.scanRegisters).toHaveBeenCalled())
  return stub.scanRegisters.mock.calls[0]?.[0]
}

const input = (testId: string): HTMLElement =>
  within(screen.getByTestId(testId)).getByRole('textbox')

beforeEach(() => {
  stub.scanRegisters.mockClear()
  useClientZustand.setState({
    ready: true,
    clientState: { ...defaultClientState }
  } as never)
  useScanRegistersZustand.setState({
    open: true,
    address: 60000,
    scanLength: 10000,
    chunkSize: 100,
    timeout: 500
  })
})

// Address and Length are masked to 65535 apiece, so the pair names an address
// neither field can hold. The dialog turns read configuration off, empties the
// grid and turns advanced mode on before it asks, and advanced mode is
// persisted, so a payload the boundary refuses outlives the launch.
describe('ScanRegisters asks for a range the boundary takes', () => {
  it('stops the range at the last register address', async () => {
    render(<ScanRegisters />)

    fireEvent.click(screen.getByTestId('scan-start-stop-btn'))

    expect(await payload()).toMatchObject({ addressRange: [60000, 65535] })
    expect(ScanRegistersParametersSchema.safeParse(await payload()).success).toBe(true)
  })

  it('leaves a range that fits where it is', async () => {
    useScanRegistersZustand.setState({ address: 0, scanLength: 1000 })

    render(<ScanRegisters />)

    fireEvent.click(screen.getByTestId('scan-start-stop-btn'))

    expect(await payload()).toMatchObject({ addressRange: [0, 999] })
  })
})

// Clearing a field stores `Number('') === 0`, which is what the store holds
// here. A length of none walked no addresses and a chunk size of none is
// refused by the schema, and both left the dialog flipping scanning on and off
// with nothing said.
describe('ScanRegisters puts a cleared field back on the blur', () => {
  it('walks one address rather than none', () => {
    useScanRegistersZustand.setState({ scanLength: 0 })

    render(<ScanRegisters />)
    fireEvent.blur(input('scan-length-input'))

    expect(useScanRegistersZustand.getState().scanLength).toBe(1)
  })

  it('asks for one register per chunk rather than none', () => {
    useScanRegistersZustand.setState({ chunkSize: 0 })

    render(<ScanRegisters />)
    fireEvent.blur(input('scan-chunk-size-input'))

    expect(useScanRegistersZustand.getState().chunkSize).toBe(1)
  })

  it('leaves a field that holds a number where it is', () => {
    render(<ScanRegisters />)
    fireEvent.blur(input('scan-length-input'))

    expect(useScanRegistersZustand.getState().scanLength).toBe(10000)
  })
})

// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The root store registers IPC listeners (window.electron.ipcRenderer) and runs
// init() (window.api.*) at import time. Stub both before the store is imported,
// and keep the one channel this file reads back.
const stub = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const scanUnitIds = vi.fn()
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: { on: () => () => {}, send: () => {}, invoke: async () => undefined }
  }
  w.api = new Proxy(
    { scanUnitIds },
    { get: (target, name) => Reflect.get(target, name) ?? (() => Promise.resolve(undefined)) }
  )
  return { scanUnitIds }
})

import { fireEvent, render, screen, within } from '@testing-library/react'
import { useClientZustand } from '@renderer/context/client.zustand'
import { defaultClientState, ScanUnitIDParametersSchema } from '@shared'
import ScanUnitIds from '../ScanUnitIds'
import { useScanUnitIdZustand } from '../scanUnitIds.zustand'

const payload = (): unknown => stub.scanUnitIds.mock.calls[0]?.[0]

const input = (testId: string): HTMLElement =>
  within(screen.getByTestId(testId)).getByRole('textbox')

beforeEach(() => {
  stub.scanUnitIds.mockClear()
  useClientZustand.setState({
    ready: true,
    clientState: { ...defaultClientState }
  } as never)
  useScanUnitIdZustand.setState({
    open: true,
    address: 0,
    length: 2,
    startUnitId: 200,
    count: 100,
    registerTypes: ['holding_registers'],
    timeout: 500
  })
})

// Start caps at 255 and Count at 256, so the pair names a unit id neither
// field can hold. The dialog clears its results before it asks, so a payload
// the boundary refuses costs the user the results and gives back nothing.
describe('ScanUnitIds asks for a range the boundary takes', () => {
  it('stops the range at the last unit id', () => {
    render(<ScanUnitIds />)

    fireEvent.click(screen.getByTestId('scan-unitid-start-stop-btn'))

    expect(payload()).toMatchObject({ range: [200, 255] })
    expect(ScanUnitIDParametersSchema.safeParse(payload()).success).toBe(true)
  })

  // Escape closes the dialog and the field unmounts with it, so the blur that
  // puts a cleared field back never fires and the request carries the zero.
  it('asks for one of each when a cleared field never got its blur', () => {
    useScanUnitIdZustand.setState({ startUnitId: 0, count: 0, length: 0 })

    render(<ScanUnitIds />)

    fireEvent.click(screen.getByTestId('scan-unitid-start-stop-btn'))

    expect(payload()).toMatchObject({ range: [0, 0], length: 1 })
    expect(ScanUnitIDParametersSchema.safeParse(payload()).success).toBe(true)
  })

  it('leaves a range that fits where it is', () => {
    useScanUnitIdZustand.setState({ startUnitId: 1, count: 6 })

    render(<ScanUnitIds />)

    fireEvent.click(screen.getByTestId('scan-unitid-start-stop-btn'))

    expect(payload()).toMatchObject({ range: [1, 6] })
  })
})

// Clearing a field stores `Number('') === 0`, which is what the store holds
// here. A count of none scanned nothing and a length of none is refused by the
// schema, and both left the dialog flipping scanning on and off with nothing
// said.
describe('ScanUnitIds puts a cleared field back on the blur', () => {
  it('scans one unit id rather than none', () => {
    useScanUnitIdZustand.setState({ count: 0 })

    render(<ScanUnitIds />)
    fireEvent.blur(input('scan-unitid-count-input'))

    expect(useScanUnitIdZustand.getState().count).toBe(1)
  })

  it('asks for one register rather than none', () => {
    useScanUnitIdZustand.setState({ length: 0 })

    render(<ScanUnitIds />)
    fireEvent.blur(input('scan-unitid-length-input'))

    expect(useScanUnitIdZustand.getState().length).toBe(1)
  })

  it('leaves a field that holds a number where it is', () => {
    render(<ScanUnitIds />)
    fireEvent.blur(input('scan-unitid-count-input'))

    expect(useScanUnitIdZustand.getState().count).toBe(100)
  })
})

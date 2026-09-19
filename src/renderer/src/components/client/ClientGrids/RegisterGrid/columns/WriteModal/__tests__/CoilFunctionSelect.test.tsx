// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_WRITE_BITS } from '@shared'

// WriteModal reaches both root stores, and each registers ipcRenderer listeners
// on import. This one reads the address the toolbar last read from.
vi.mock('@renderer/context/client.zustand', () => ({
  useClientZustand: Object.assign(
    (selector: (state: { registerConfig: { address: number } }) => unknown) =>
      selector({ registerConfig: { address: 0 } }),
    { getState: () => ({}) }
  )
}))
vi.mock('@renderer/context/data.zustand', () => ({
  useDataZustand: Object.assign(() => undefined, { getState: () => ({ registerData: [] }) })
}))

const { enqueueSnackbar } = vi.hoisted(() => ({ enqueueSnackbar: vi.fn() }))
vi.mock('notistack', () => ({
  useSnackbar: (): { enqueueSnackbar: typeof enqueueSnackbar } => ({ enqueueSnackbar })
}))

import { CoilFunctionSelect } from '../WriteModal'
import { useValueInputZustand } from '../writeModal.zustand'

const mockWrite = vi.fn()

// @ts-expect-error - Mocking window.api for tests
global.window.api = { write: mockWrite }

const written = (): boolean[] => {
  const payload = mockWrite.mock.calls[0]?.[0] as { value: boolean[] } | undefined
  return payload?.value ?? []
}

// The Length field took the 2000 FC01 answers, and the dialog writes over the
// window the toolbar read. FC15 carries the data as well as the address and the
// quantity, so it stops 32 bits short of that.
describe('the coil write', () => {
  beforeEach(() => {
    mockWrite.mockClear()
    enqueueSnackbar.mockClear()
    useValueInputZustand.setState({
      address: 0,
      coilFunction: 15,
      coils: new Array<boolean>(2000).fill(true)
    })
  })

  it('sends what one FC15 carries', async () => {
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-submit-btn'))

    expect(written().length).toBe(MAX_WRITE_BITS)
  })

  // The grid goes on showing what the read left there, so a coil nothing was
  // written to reads the same as one that was.
  it('says what it left alone', async () => {
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-submit-btn'))

    expect(enqueueSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'One request writes 1968 coils, so the last 32 were left alone'
      })
    )
  })

  // FC5 writes the first coil and leaves the other 1999, so the count the
  // message carries is about the request FC15 would have sent.
  it('says nothing about a tail when it writes one coil', async () => {
    useValueInputZustand.setState({ coilFunction: 5 })
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-submit-btn'))

    expect(enqueueSnackbar).not.toHaveBeenCalled()
  })

  it('sends a window that fits whole', async () => {
    useValueInputZustand.setState({ coils: new Array<boolean>(125).fill(true) })
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-submit-btn'))

    expect(written().length).toBe(125)
    expect(enqueueSnackbar).not.toHaveBeenCalled()
  })

  // The button you press is where the write starts, so the tail it can reach is
  // shorter the further in it sits.
  it('starts at the coil you pressed', async () => {
    useValueInputZustand.setState({ address: 40 })
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-submit-btn'))

    expect(written().length).toBe(1960)
  })
})

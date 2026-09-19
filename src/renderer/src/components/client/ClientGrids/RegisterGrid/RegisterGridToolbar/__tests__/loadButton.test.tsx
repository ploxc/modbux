// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// The file input renders behind `{!opening && ...}`, so a load that leaves
// `opening` true takes the only way to pick a file out of the DOM. Playwright
// cannot make `File.text()` reject, which is why this is a unit test.
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time, so
// the boundary has to answer before this file's own imports are evaluated.
// `stubRenderer` answers each channel with the schema `main/ipc.ts` guards it
// with, and `isServerWindow` as the boolean the preload exposes.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

const { enqueueSnackbar } = vi.hoisted(() => ({ enqueueSnackbar: vi.fn() }))
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar }) }))

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useClientZustand } from '@renderer/context/client.zustand'
import LoadButton from '../LoadButton'

const CONFIG = JSON.stringify({
  version: 2,
  modbuxVersion: '2.0.0',
  name: 'Test Client',
  littleEndian: false,
  registerMapping: {
    coils: {},
    discrete_inputs: {},
    holding_registers: { '0': { dataType: 'int16' } },
    input_registers: {}
  }
})

/** A file that answers what it was given, or refuses to be read. */
const fileAnswering = (text: () => Promise<string>): File => ({ text }) as unknown as File

const pick = async (file: File): Promise<void> => {
  const input = screen.getByTestId('load-config-file-input')
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } })
  })
}

const messages = (): unknown[] =>
  enqueueSnackbar.mock.calls.map((call) => (call[0] as { message: unknown }).message)

beforeEach(() => {
  enqueueSnackbar.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useClientZustand.setState({ name: '' } as never)
})

describe('a file that cannot be read', () => {
  it('leaves the button able to open another one', async () => {
    render(<LoadButton />)

    await pick(fileAnswering(() => Promise.reject(new Error('it is gone'))))

    await waitFor(() => expect(messages()).toContain('Failed to load config: it is gone'))
    expect(screen.getByTestId('load-config-file-input')).toBeInTheDocument()
    expect(screen.getByTestId('load-config-btn')).not.toBeDisabled()
  })
})

describe('a file that reads', () => {
  it('is opened, and the button takes another one', async () => {
    render(<LoadButton />)

    await pick(fileAnswering(() => Promise.resolve(CONFIG)))

    await waitFor(() => expect(messages()).toContain('Configuration opened successfully'))
    // The mapping is what the file was for, and `replaceRegisterMapping` writes
    // it only where main took it. `stubRenderer` answers that channel with the
    // schema `main/ipc.ts` guards it with.
    expect(useClientZustand.getState().registerMapping.holding_registers[0]).toEqual({
      dataType: 'int16'
    })
    expect(useClientZustand.getState().name).toBe('Test Client')
    expect(screen.getByTestId('load-config-file-input')).toBeInTheDocument()
    expect(screen.getByTestId('load-config-btn')).not.toBeDisabled()
  })
})

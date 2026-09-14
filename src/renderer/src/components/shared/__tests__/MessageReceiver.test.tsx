// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BackendMessage } from '@shared'

// ─── Store stubs ─────────────────────────────────────────────────────
// Both real stores talk to window.api on import, which is far more machinery
// than the listener needs. Neither reset is set, so only the listener runs.

const clientState = { configReset: undefined, acknowledgeConfigReset: vi.fn() }
const serverState = { configReset: undefined, acknowledgeConfigReset: vi.fn() }

vi.mock('@renderer/context/client.zustand', () => ({
  useClientZustand: Object.assign(
    (selector: (state: typeof clientState) => unknown) => selector(clientState),
    { getState: () => clientState }
  )
}))
vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof serverState) => unknown) => selector(serverState),
    { getState: () => serverState }
  )
}))

const mockEnqueueSnackbar = vi.fn()
vi.mock('notistack', () => ({
  useSnackbar: (): { enqueueSnackbar: typeof mockEnqueueSnackbar } => ({
    enqueueSnackbar: mockEnqueueSnackbar
  })
}))

/** The listener `onEvent` was handed, so a test can deliver a message to it. */
let listener: ((message: BackendMessage) => void) | undefined
const mockUnlisten = vi.fn()
vi.mock('@renderer/events', () => ({
  onEvent: vi.fn((_event: string, handler: (message: BackendMessage) => void) => {
    listener = handler
    return mockUnlisten
  })
}))

import MessageReceiver from '../MessageReceiver'

// @ts-expect-error - Mocking window.api for tests
global.window.api = { isServerWindow: false }

const refusal: BackendMessage = {
  message: 'Invalid request, nothing was changed',
  variant: 'error',
  error: 'set_server_port: port: Number must be greater than or equal to 1'
}

describe('MessageReceiver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listener = undefined
  })

  it('shows a message the main window receives', () => {
    window.api.isServerWindow = false
    render(<MessageReceiver />)

    listener?.(refusal)

    expect(mockEnqueueSnackbar).toHaveBeenCalledWith({
      message: refusal.message,
      variant: 'error'
    })
  })

  // The server window returned before subscribing, so in split view a payload
  // refused on a channel it owns reported into the window the user was not
  // looking at, and the port field snapped back with nothing said.
  it('shows a message the server window receives', () => {
    window.api.isServerWindow = true
    render(<MessageReceiver />)

    listener?.(refusal)

    expect(mockEnqueueSnackbar).toHaveBeenCalledWith({
      message: refusal.message,
      variant: 'error'
    })
  })
})

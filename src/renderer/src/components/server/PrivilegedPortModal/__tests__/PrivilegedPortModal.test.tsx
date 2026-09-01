// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PrivilegedPortStatus, PrivilegedPortFixResult } from '@shared'

// ─── Store stub ──────────────────────────────────────────────────────
// The real store persists through window.api on import, which is far more
// machinery than this component needs.

const mockSetPort = vi.fn()
const storeState = {
  selectedUuid: 'main',
  port: { main: '1024' } as Record<string, string>,
  ready: { main: true } as Record<string, boolean>,
  setPort: mockSetPort
}

vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  )
}))

const mockEnqueueSnackbar = vi.fn()
vi.mock('notistack', () => ({
  useSnackbar: (): { enqueueSnackbar: typeof mockEnqueueSnackbar } => ({
    enqueueSnackbar: mockEnqueueSnackbar
  })
}))

import PrivilegedPortModal from '../PrivilegedPortModal'
import { usePrivilegedPortZustand } from '../privilegedPortModal.zustand'

// ─── window.api stub ─────────────────────────────────────────────────

const mockGetStatus = vi.fn()
const mockApplyFix = vi.fn()

// @ts-expect-error - Mocking window.api for tests
global.window.api = {
  isServerWindow: false,
  getPrivilegedPortStatus: mockGetStatus,
  applyPrivilegedPortFix: mockApplyFix
}

const blockedStatus: PrivilegedPortStatus = {
  port: 502,
  supported: true,
  unprivilegedPortStart: 1024,
  needsElevation: true,
  canElevate: true
}

const okResult: PrivilegedPortFixResult = {
  ok: true,
  message: 'Port 502 is available now.',
  unprivilegedPortStart: 502
}

describe('PrivilegedPortModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.api.isServerWindow = false
    storeState.port = { main: '1024' }
    storeState.ready = { main: true }
    // The modal's own store is module scope, so it outlives a render the way it
    // outlives a remount in the app. Each test starts from a closed modal.
    usePrivilegedPortZustand.setState({
      open: false,
      status: null,
      busy: false,
      dontAsk: false,
      mode: 'persist'
    })
    mockGetStatus.mockResolvedValue(blockedStatus)
    mockApplyFix.mockResolvedValue(okResult)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── When it appears ───────────────────────────────────────────────

  it('opens when port 502 is below the kernel floor', async () => {
    render(<PrivilegedPortModal />)
    expect(await screen.findByTestId('privileged-port-modal')).toBeInTheDocument()
  })

  it('asks about 502, not the fallback port the server landed on', async () => {
    render(<PrivilegedPortModal />)
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalledWith(502))
  })

  it('stays closed when the floor is already low enough', async () => {
    mockGetStatus.mockResolvedValue({ ...blockedStatus, needsElevation: false })
    render(<PrivilegedPortModal />)
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalled())
    expect(screen.queryByTestId('privileged-port-modal')).not.toBeInTheDocument()
  })

  it('stays closed in the popped-out server window', async () => {
    window.api.isServerWindow = true
    render(<PrivilegedPortModal />)
    await waitFor(() => expect(mockGetStatus).not.toHaveBeenCalled())
  })

  it('stays closed once dismissed for good', async () => {
    localStorage.setItem('privilegedPortPromptDismissed', 'true')
    render(<PrivilegedPortModal />)
    await waitFor(() => expect(mockGetStatus).not.toHaveBeenCalled())
  })

  it('waits until the server is ready', async () => {
    storeState.ready = { main: false }
    render(<PrivilegedPortModal />)
    await waitFor(() => expect(mockGetStatus).not.toHaveBeenCalled())
  })

  it('survives a detection failure without breaking the view', async () => {
    mockGetStatus.mockRejectedValue(new Error('ipc down'))
    render(<PrivilegedPortModal />)
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalled())
    expect(screen.queryByTestId('privileged-port-modal')).not.toBeInTheDocument()
  })

  // ─── What it says ──────────────────────────────────────────────────

  it('explains the fallback port the user is looking at', async () => {
    render(<PrivilegedPortModal />)
    await screen.findByTestId('privileged-port-modal')
    expect(screen.getByText(/this server is on 1024 instead/)).toBeInTheDocument()
  })

  it('shows the exact command that will run', async () => {
    render(<PrivilegedPortModal />)
    const command = await screen.findByTestId('privileged-port-command')
    expect(command).toHaveTextContent('pkexec')
    expect(command).toHaveTextContent('net.ipv4.ip_unprivileged_port_start=502')
  })

  it('switches the shown command when the mode changes', async () => {
    const user = userEvent.setup()
    render(<PrivilegedPortModal />)
    await screen.findByTestId('privileged-port-modal')

    // Persist is the default, so the drop-in path is on screen.
    expect(screen.getByTestId('privileged-port-command')).toHaveTextContent('sysctl.d')

    await user.click(screen.getByTestId('privileged-port-mode-session'))
    expect(screen.getByTestId('privileged-port-command')).not.toHaveTextContent('sysctl.d')
  })

  // ─── Sandboxed / no pkexec ─────────────────────────────────────────

  it('offers no button inside a sandbox, only the command', async () => {
    mockGetStatus.mockResolvedValue({ ...blockedStatus, canElevate: false, sandbox: 'flatpak' })
    render(<PrivilegedPortModal />)
    await screen.findByTestId('privileged-port-modal')

    expect(screen.getByText(/Flatpak/)).toBeInTheDocument()
    expect(screen.queryByTestId('privileged-port-allow-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('privileged-port-command')).toBeInTheDocument()
  })

  it('explains a missing pkexec', async () => {
    mockGetStatus.mockResolvedValue({ ...blockedStatus, canElevate: false })
    render(<PrivilegedPortModal />)
    await screen.findByTestId('privileged-port-modal')

    expect(screen.getByText(/pkexec is not installed/)).toBeInTheDocument()
    expect(screen.queryByTestId('privileged-port-allow-btn')).not.toBeInTheDocument()
  })

  // ─── Running the fix ───────────────────────────────────────────────

  it('runs the selected mode and moves the server onto 502', async () => {
    const user = userEvent.setup()
    render(<PrivilegedPortModal />)
    await screen.findByTestId('privileged-port-modal')

    await user.click(screen.getByTestId('privileged-port-allow-btn'))

    await waitFor(() => expect(mockApplyFix).toHaveBeenCalledWith('persist'))
    expect(mockSetPort).toHaveBeenCalledWith('502')
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' })
    )
  })

  it('runs the session command when that mode is picked', async () => {
    const user = userEvent.setup()
    render(<PrivilegedPortModal />)
    await screen.findByTestId('privileged-port-modal')

    await user.click(screen.getByTestId('privileged-port-mode-session'))
    await user.click(screen.getByTestId('privileged-port-allow-btn'))

    await waitFor(() => expect(mockApplyFix).toHaveBeenCalledWith('session'))
  })

  it('leaves the port alone when the user cancels the prompt', async () => {
    const user = userEvent.setup()
    mockApplyFix.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
      message: 'Authorization was cancelled. Nothing has changed.'
    })
    render(<PrivilegedPortModal />)
    await screen.findByTestId('privileged-port-modal')

    await user.click(screen.getByTestId('privileged-port-allow-btn'))

    await waitFor(() => expect(mockApplyFix).toHaveBeenCalled())
    expect(mockSetPort).not.toHaveBeenCalled()
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'warning' })
    )
    // Still open, so the user can try again.
    expect(screen.getByTestId('privileged-port-modal')).toBeInTheDocument()
  })

  // ─── Dismissing ────────────────────────────────────────────────────

  it('remembers "don\'t ask again" only when it is ticked', async () => {
    const user = userEvent.setup()
    render(<PrivilegedPortModal />)
    await screen.findByTestId('privileged-port-modal')

    await user.click(screen.getByTestId('privileged-port-cancel-btn'))
    expect(localStorage.getItem('privilegedPortPromptDismissed')).toBeNull()
  })

  it('remembers the dismissal when asked to', async () => {
    const user = userEvent.setup()
    render(<PrivilegedPortModal />)
    await screen.findByTestId('privileged-port-modal')

    await user.click(screen.getByTestId('privileged-port-dont-ask'))
    await user.click(screen.getByTestId('privileged-port-cancel-btn'))

    expect(localStorage.getItem('privilegedPortPromptDismissed')).toBe('true')
  })
})

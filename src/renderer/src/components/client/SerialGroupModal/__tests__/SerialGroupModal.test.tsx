// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { create } from 'zustand'
import type { SerialGroupStatus, SerialGroupFixResult } from '@shared'

// ─── Store stub ──────────────────────────────────────────────────────
// The real root store registers ipcRenderer listeners on import, which is far
// more machinery than this component needs. Only the port list matters here.

interface RootStub {
  serialPorts: { path: string }[]
}

// A real store, not a plain object: a plugged-in adapter reaches the component
// by the store notifying it, and a stub that is only read during a render can
// only be driven by re-rendering the parent, which memo refuses.
const useRootStub = create<RootStub>(() => ({ serialPorts: [] }))

vi.mock('@renderer/context/client.zustand', () => ({
  useClientZustand: Object.assign(
    (selector: (state: RootStub) => unknown) => useRootStub(selector),
    {
      getState: (): RootStub => useRootStub.getState()
    }
  )
}))

const mockEnqueueSnackbar = vi.fn()
vi.mock('notistack', () => ({
  useSnackbar: (): { enqueueSnackbar: typeof mockEnqueueSnackbar } => ({
    enqueueSnackbar: mockEnqueueSnackbar
  })
}))

import SerialGroupModal from '../SerialGroupModal'
import { useSerialGroupZustand } from '../serialGroupModal.zustand'

// ─── window.api stub ─────────────────────────────────────────────────

const mockGetStatus = vi.fn()
const mockApplyFix = vi.fn()
const mockRequestLogout = vi.fn()

// @ts-expect-error - Mocking window.api for tests
global.window.api = {
  getSerialGroupStatus: mockGetStatus,
  applySerialGroupFix: mockApplyFix,
  requestLogout: mockRequestLogout
}

/** Not in the group, with an adapter that refuses to open. */
const needsMembership: SerialGroupStatus = {
  group: 'dialout',
  supported: true,
  username: 'tester',
  needsMembership: true,
  pendingLogin: false,
  canElevate: true
}

/** usermod has run: the file lists you, this session does not have it yet. */
const pendingLogin: SerialGroupStatus = {
  ...needsMembership,
  needsMembership: false,
  pendingLogin: true
}

const okResult: SerialGroupFixResult = {
  ok: true,
  message: 'You are in dialout now. Log out and back in for it to take effect.'
}

describe('SerialGroupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The store is module scope, so it outlives a render the way it outlives a
    // remount in the app. Each test starts from a closed modal and a fresh no.
    useSerialGroupZustand.setState({
      open: false,
      status: null,
      busy: false,
      done: false,
      declined: false
    })
    useRootStub.setState({ serialPorts: [] })
    mockGetStatus.mockResolvedValue(needsMembership)
    mockApplyFix.mockResolvedValue(okResult)
    mockRequestLogout.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── When it appears ───────────────────────────────────────────────

  it('opens when the user is not in the group', async () => {
    render(<SerialGroupModal active />)
    expect(await screen.findByTestId('serial-group-modal')).toBeInTheDocument()
  })

  it('never asks while TCP is the selected transport', async () => {
    render(<SerialGroupModal active={false} />)
    await waitFor(() => expect(mockGetStatus).not.toHaveBeenCalled())
  })

  it('stays closed when every port already opens', async () => {
    mockGetStatus.mockResolvedValue({ ...needsMembership, needsMembership: false })
    render(<SerialGroupModal active />)
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalled())
    expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument()
  })

  it('survives a detection failure without breaking the client view', async () => {
    mockGetStatus.mockRejectedValue(new Error('ipc down'))
    render(<SerialGroupModal active />)
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalled())
    expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument()
  })

  it('opens straight into the log-out step when the group is already in the file', async () => {
    mockGetStatus.mockResolvedValue(pendingLogin)
    render(<SerialGroupModal active />)
    expect(await screen.findByTestId('serial-group-pending-login')).toBeInTheDocument()
    expect(screen.queryByTestId('serial-group-allow-btn')).not.toBeInTheDocument()
  })

  // ─── What it says ──────────────────────────────────────────────────

  it('names the group and who is not in it', async () => {
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-modal')
    expect(screen.getByText(/tester is not in it/)).toBeInTheDocument()
  })

  it('shows the exact command that will run', async () => {
    render(<SerialGroupModal active />)
    const command = await screen.findByTestId('serial-group-command')
    expect(command).toHaveTextContent('pkexec')
    expect(command).toHaveTextContent('usermod -aG dialout tester')
  })

  // ─── Sandboxed / no pkexec ─────────────────────────────────────────

  it('offers no button inside a sandbox, only the command', async () => {
    mockGetStatus.mockResolvedValue({ ...needsMembership, canElevate: false, sandbox: 'flatpak' })
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-modal')

    expect(screen.getByText(/Flatpak/)).toBeInTheDocument()
    expect(screen.queryByTestId('serial-group-allow-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('serial-group-command')).toBeInTheDocument()
  })

  it('explains a missing pkexec', async () => {
    mockGetStatus.mockResolvedValue({ ...needsMembership, canElevate: false })
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-modal')

    expect(screen.getByText(/pkexec is not installed/)).toBeInTheDocument()
    expect(screen.queryByTestId('serial-group-allow-btn')).not.toBeInTheDocument()
  })

  // ─── Running the fix ───────────────────────────────────────────────

  it('runs the fix and moves on to the log-out step', async () => {
    const user = userEvent.setup()
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-modal')

    await user.click(screen.getByTestId('serial-group-allow-btn'))

    await waitFor(() => expect(mockApplyFix).toHaveBeenCalled())
    expect(await screen.findByTestId('serial-group-pending-login')).toBeInTheDocument()
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' })
    )
  })

  it('stays on the question when the fix reports a failure', async () => {
    const user = userEvent.setup()
    mockApplyFix.mockResolvedValue({ ok: false, reason: 'cancelled', message: 'Nothing changed.' })
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-modal')

    await user.click(screen.getByTestId('serial-group-allow-btn'))

    await waitFor(() =>
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'warning' })
      )
    )
    expect(screen.queryByTestId('serial-group-pending-login')).not.toBeInTheDocument()
    expect(screen.getByTestId('serial-group-allow-btn')).toBeInTheDocument()
  })

  it('reports a thrown error rather than leaving the button spinning', async () => {
    const user = userEvent.setup()
    mockApplyFix.mockRejectedValue(new Error('ipc down'))
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-modal')

    await user.click(screen.getByTestId('serial-group-allow-btn'))

    await waitFor(() =>
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' })
      )
    )
    expect(screen.getByTestId('serial-group-allow-btn')).toBeEnabled()
  })

  it('checks again when an adapter is plugged in while RTU is already selected', async () => {
    // Nothing plugged in: every port opens, so there is nothing to say.
    mockGetStatus.mockResolvedValue({ ...needsMembership, needsMembership: false })
    render(<SerialGroupModal active />)
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument()

    // Refreshing the list is how a newly plugged adapter shows up.
    mockGetStatus.mockResolvedValue(needsMembership)
    act(() => useRootStub.setState({ serialPorts: [{ path: '/dev/ttyACM0' }] }))

    expect(await screen.findByTestId('serial-group-modal')).toBeInTheDocument()
  })

  // ─── Saying no ─────────────────────────────────────────────────────

  it('closes on Not now and does not ask again while the app is open', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-modal')

    await user.click(screen.getByTestId('serial-group-close-btn'))
    // The dialog fades out before it unmounts.
    await waitFor(() => expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument())

    // Switching to TCP and back is what re-runs the check.
    rerender(<SerialGroupModal active={false} />)
    rerender(<SerialGroupModal active />)

    await waitFor(() => expect(mockGetStatus).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument()
  })

  it('answers a Connect press even after a no, because that press cannot succeed', async () => {
    const user = userEvent.setup()
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-modal')
    await user.click(screen.getByTestId('serial-group-close-btn'))
    await waitFor(() => expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument())

    // What the Connect button does before it tries the port.
    const opened = await useSerialGroupZustand.getState().check(true)

    expect(opened).toBe(true)
    expect(await screen.findByTestId('serial-group-modal')).toBeInTheDocument()
  })

  it('leaves an unforced check silent after a no', async () => {
    const user = userEvent.setup()
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-modal')
    await user.click(screen.getByTestId('serial-group-close-btn'))
    await waitFor(() => expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument())

    expect(await useSerialGroupZustand.getState().check()).toBe(false)
    expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument()
  })

  // ─── Logging out ───────────────────────────────────────────────────

  it('asks the desktop to log out', async () => {
    const user = userEvent.setup()
    mockGetStatus.mockResolvedValue(pendingLogin)
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-pending-login')

    await user.click(screen.getByTestId('serial-group-logout-btn'))

    await waitFor(() => expect(mockRequestLogout).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument())
  })

  it('says to log out by hand when no session manager answered', async () => {
    const user = userEvent.setup()
    mockGetStatus.mockResolvedValue(pendingLogin)
    mockRequestLogout.mockResolvedValue(false)
    render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-pending-login')

    await user.click(screen.getByTestId('serial-group-logout-btn'))

    await waitFor(() =>
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info' }))
    )
  })

  it('Later closes without swallowing the question for the rest of the run', async () => {
    const user = userEvent.setup()
    mockGetStatus.mockResolvedValue(pendingLogin)
    const { rerender } = render(<SerialGroupModal active />)
    await screen.findByTestId('serial-group-pending-login')

    await user.click(screen.getByTestId('serial-group-later-btn'))
    await waitFor(() => expect(screen.queryByTestId('serial-group-modal')).not.toBeInTheDocument())

    rerender(<SerialGroupModal active={false} />)
    rerender(<SerialGroupModal active />)

    expect(await screen.findByTestId('serial-group-pending-login')).toBeInTheDocument()
  })
})

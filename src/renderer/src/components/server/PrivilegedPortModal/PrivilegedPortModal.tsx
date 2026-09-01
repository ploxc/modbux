import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import CommandBlock from '@renderer/components/shared/CommandBlock'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useServerZustand } from '@renderer/context/server.zustand'
import {
  PrivilegedPortFixMode,
  PrivilegedPortStatus,
  privilegedPortCommandDisplay,
  UNPRIVILEGED_PORT_START_TARGET
} from '@shared'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect } from 'react'
import { usePrivilegedPortZustand } from './privilegedPortModal.zustand'

/**
 * Linux privileged port modal
 *
 * Ports below the kernel's unprivileged floor (1024 by default) belong to root,
 * and Modbus defaults to 502. Without this, Modbux walks up to the first port
 * it can bind — 1024 — and the user has to work out why their client cannot
 * reach it. The answer is a sysctl documented in the README, which nobody
 * reads before filing an issue.
 *
 * So: detect it, explain it, and offer to run the one command that fixes it.
 * The command is shown verbatim because it loosens a system-wide security
 * boundary. That is the user's call to make, not ours to make quietly.
 */

/** Remembered across restarts — a user who says no once should not be nagged. */
const DISMISS_KEY = 'privilegedPortPromptDismissed'

/** Why Modbux cannot run the command itself, or null when it can. */
const blockedReason = (status: PrivilegedPortStatus | null): string | null => {
  if (!status) return null
  if (status.sandbox) {
    const name = status.sandbox === 'flatpak' ? 'Flatpak' : 'Snap'
    return `Modbux is running inside ${name}, so it cannot change system settings itself.`
  }
  if (!status.canElevate) {
    return 'pkexec is not installed, so Modbux cannot ask for permission itself.'
  }
  return null
}

/** Closes, remembering the answer when asked to. Not a hook: nothing subscribes. */
const close = (): void => {
  const { dontAsk, setOpen } = usePrivilegedPortZustand.getState()
  if (dontAsk) localStorage.setItem(DISMISS_KEY, 'true')
  setOpen(false)
}

//
//
// Title
const Title = meme((): JSX.Element => {
  const port = usePrivilegedPortZustand((z) => z.status?.port)
  return <DialogTitle>Port {port} needs a system setting</DialogTitle>
})

//
//
// What is in the way
const Explanation = meme((): JSX.Element => {
  const port = usePrivilegedPortZustand((z) => z.status?.port)
  const floor = usePrivilegedPortZustand((z) => z.status?.unprivilegedPortStart)

  // Where the server actually landed. When 502 is blocked the backend has
  // already walked up to the first bindable port, so this is the fallback the
  // user is looking at — not the port they asked for.
  const actualPort = useServerZustand((z) => Number(z.port[z.selectedUuid] ?? 0))

  return (
    <Typography variant="body2" sx={{ mb: 2 }}>
      Linux reserves ports below {floor} for root, and Modbus uses {port} by default.{' '}
      {actualPort && actualPort !== port
        ? `That is why this server is on ${actualPort} instead — a client looking for ${port} will not find it.`
        : `Until that floor is lowered, Modbux cannot use it and clients looking for ${port} will not find it.`}
    </Typography>
  )
})

//
//
// Permanently or until reboot, driving both the command shown and the one run
const ModeToggle = meme((): JSX.Element => {
  const mode = usePrivilegedPortZustand((z) => z.mode)
  const setMode = usePrivilegedPortZustand((z) => z.setMode)

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      color="primary"
      value={mode}
      onChange={(_, value: PrivilegedPortFixMode | null) => value && setMode(value)}
      sx={{ mb: 1.5 }}
    >
      <ToggleButton value="persist" data-testid="privileged-port-mode-persist">
        Permanently
      </ToggleButton>
      <ToggleButton value="session" data-testid="privileged-port-mode-session">
        Until reboot
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

//
//
// The command, which follows the toggle so the two cannot drift apart
const Command = meme((): JSX.Element => {
  const mode = usePrivilegedPortZustand((z) => z.mode)
  const blocked = usePrivilegedPortZustand((z) => blockedReason(z.status))

  // With no button to press, the terminal instructions are the lasting fix.
  return (
    <CommandBlock
      command={privilegedPortCommandDisplay(blocked ? 'persist' : mode)}
      testId="privileged-port-command"
    />
  )
})

//
//
// Don't ask again
const DontAskCheckbox = meme((): JSX.Element => {
  const dontAsk = usePrivilegedPortZustand((z) => z.dontAsk)
  const setDontAsk = usePrivilegedPortZustand((z) => z.setDontAsk)

  return (
    <FormControlLabel
      sx={{ mt: 2 }}
      control={
        <Checkbox
          size="small"
          checked={dontAsk}
          onChange={(e) => setDontAsk(e.target.checked)}
          data-testid="privileged-port-dont-ask"
        />
      }
      label={<Typography variant="body2">Don&apos;t ask again</Typography>}
    />
  )
})

//
//
// Body
const Body = meme((): JSX.Element => {
  const blocked = usePrivilegedPortZustand((z) => blockedReason(z.status))

  return (
    <>
      <Explanation />

      {blocked ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {blocked} Run this in a terminal instead:
        </Alert>
      ) : (
        <>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Modbux can lower it for you. This makes every port from {UNPRIVILEGED_PORT_START_TARGET}{' '}
            up bindable without root, system-wide — you will be asked for your password.
          </Typography>
          <ModeToggle />
          <Typography variant="body2" sx={{ mb: 1 }}>
            This is what will run:
          </Typography>
        </>
      )}

      <Command />
      <DontAskCheckbox />
    </>
  )
})

//
//
// Buttons
const CancelButton = meme((): JSX.Element => {
  const busy = usePrivilegedPortZustand((z) => z.busy)
  return (
    <Button onClick={close} disabled={busy} data-testid="privileged-port-cancel-btn">
      Not now
    </Button>
  )
})

const RunCommandButton = meme((): JSX.Element | null => {
  const busy = usePrivilegedPortZustand((z) => z.busy)
  const blocked = usePrivilegedPortZustand((z) => blockedReason(z.status))
  const { enqueueSnackbar } = useSnackbar()

  const apply = useCallback(async (): Promise<void> => {
    const { setBusy, setOpen, mode } = usePrivilegedPortZustand.getState()
    setBusy(true)
    try {
      const result = await window.api.applyPrivilegedPortFix(mode)
      enqueueSnackbar({ message: result.message, variant: result.ok ? 'success' : 'warning' })

      if (!result.ok) return

      // Move the server onto the port it could not bind a moment ago.
      await useServerZustand.getState().setPort(String(UNPRIVILEGED_PORT_START_TARGET))
      setOpen(false)
    } catch {
      enqueueSnackbar({ message: 'Could not change the port setting', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }, [enqueueSnackbar])

  if (blocked) return null

  return (
    <Button onClick={apply} disabled={busy} data-testid="privileged-port-allow-btn">
      {busy ? 'Waiting for authorization…' : 'Run command'}
    </Button>
  )
})

//
//
// MAIN
const PrivilegedPortModal = meme((): JSX.Element | null => {
  const open = usePrivilegedPortZustand((z) => z.open)
  const hasStatus = usePrivilegedPortZustand((z) => z.status !== null)
  const ready = useServerZustand((z) => !!z.ready[z.selectedUuid])

  useEffect(() => {
    // The popped-out server window would otherwise show a second copy.
    if (window.api.isServerWindow) return
    if (localStorage.getItem(DISMISS_KEY) === 'true') return
    if (!ready) return

    let cancelled = false
    const check = async (): Promise<void> => {
      const { setStatus, setOpen } = usePrivilegedPortZustand.getState()
      try {
        // Always ask about 502 rather than the port in use. By the time the
        // view renders, an unbindable 502 has already become 1024, and asking
        // about 1024 would report no problem at all.
        const result = await window.api.getPrivilegedPortStatus(UNPRIVILEGED_PORT_START_TARGET)
        if (cancelled) return
        // Close rather than return: the store outlives a remount, so a stale
        // open would otherwise keep an answered question on screen.
        if (!result.needsElevation) return setOpen(false)
        setStatus(result)
        setOpen(true)
      } catch {
        // Detection is a convenience — never let it break the server view.
      }
    }
    check()

    return (): void => {
      cancelled = true
    }
  }, [ready])

  if (!hasStatus) return null

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth data-testid="privileged-port-modal">
      <Title />
      <DialogContent>
        <Body />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <CancelButton />
        <RunCommandButton />
      </DialogActions>
    </Dialog>
  )
})

export default PrivilegedPortModal

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@mui/material'
import CommandBlock from '@renderer/components/shared/CommandBlock'
import { SerialGroupStatus, serialGroupCommandDisplay } from '@shared'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect } from 'react'
import { useSerialGroupZustand } from './_zustand'

/**
 * Linux serial group modal
 *
 * A serial port belongs to a group, and a user outside it opens nothing. The
 * port list is then empty, which reads as no adapter rather than no
 * permission, and the answer is a command documented where nobody looks.
 *
 * Two things it does differently from the privileged port modal. Nothing is
 * written down: a server can move to another port, so "don't ask again" earns
 * its place there, while RTU cannot work without the group and the question
 * belongs with it. Closing is allowed, or there is no way back to TCP either,
 * and a no is kept for as long as the app is open. Switching transports back
 * and forth should not ask again; starting Modbux tomorrow should.
 *
 * And the command is not the end: group membership arrives at the next login,
 * so the modal offers to log out once it has run.
 *
 * Most people never see this. Mint and Ubuntu put the first user in the group
 * at install time.
 */

/** Why Modbux cannot run the command itself, or null when it can. */
const blockedReason = (status: SerialGroupStatus | null): string | null => {
  if (!status) return null
  if (status.sandbox) {
    const name = status.sandbox === 'flatpak' ? 'Flatpak' : 'Snap'
    return `Modbux is running inside ${name}, so it cannot change your groups itself.`
  }
  if (!status.canElevate) {
    return 'pkexec is not installed, so Modbux cannot ask for permission itself.'
  }
  return null
}

/** A no, kept for as long as the window lives. Not a hook: nothing subscribes. */
const decline = (): void => {
  const { setDeclined, setOpen } = useSerialGroupZustand.getState()
  setDeclined(true)
  setOpen(false)
}

//
//
// The command, built from whoever is logged in
const Command = (): JSX.Element => {
  const username = useSerialGroupZustand((z) => z.status?.username)
  return (
    <CommandBlock
      command={serialGroupCommandDisplay(username ?? '$USER')}
      testId="serial-group-command"
    />
  )
}

//
//
// After the command has run: in the file, not yet in the session
const PendingLogin = (): JSX.Element => {
  const group = useSerialGroupZustand((z) => z.status?.group)
  return (
    <Alert
      severity="success"
      data-testid="serial-group-pending-login"
      // MUI tints both text and background from success.light in dark mode,
      // which reads as washed green on green. Keep the tick, drop the tint.
      sx={(theme) => ({
        color: theme.palette.text.primary,
        border: `1px solid ${theme.palette.divider}`,
        background: theme.palette.background.paper
      })}
    >
      You are in {group} now. A session keeps the groups it was given at login, so log out and back
      in before the ports appear.
    </Alert>
  )
}

//
//
// Before it has run: what is wrong, and what will fix it
const Explanation = (): JSX.Element => {
  const group = useSerialGroupZustand((z) => z.status?.group)
  const username = useSerialGroupZustand((z) => z.status?.username)
  // A string or null, so it compares by value like any other primitive.
  const blocked = useSerialGroupZustand((z) => blockedReason(z.status))

  return (
    <>
      <Typography variant="body2" sx={{ mb: 2 }}>
        On Linux a serial port belongs to the {group} group, and {username} is not in it. Until that
        changes, Modbux lists no ports at all, whatever is plugged in.
      </Typography>

      {blocked ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {blocked} Run this in a terminal instead:
        </Alert>
      ) : (
        <Typography variant="body2" sx={{ mb: 1 }}>
          Modbux can do it for you. You will be asked for your password, and this is what will run:
        </Typography>
      )}

      <Command />
    </>
  )
}

//
//
// Body
const Body = (): JSX.Element => {
  const done = useSerialGroupZustand((z) => z.done)
  return done ? <PendingLogin /> : <Explanation />
}

//
//
// Buttons
const NotNowButton = (): JSX.Element => {
  const busy = useSerialGroupZustand((z) => z.busy)
  return (
    <Button onClick={decline} disabled={busy} data-testid="serial-group-close-btn">
      Not now
    </Button>
  )
}

const RunCommandButton = (): JSX.Element | null => {
  const busy = useSerialGroupZustand((z) => z.busy)
  const blocked = useSerialGroupZustand((z) => blockedReason(z.status))
  const { enqueueSnackbar } = useSnackbar()

  const apply = useCallback(async (): Promise<void> => {
    const { setBusy, setDone } = useSerialGroupZustand.getState()
    setBusy(true)
    try {
      const result = await window.api.applySerialGroupFix()
      enqueueSnackbar({ message: result.message, variant: result.ok ? 'success' : 'warning' })
      if (result.ok) setDone(true)
    } catch {
      enqueueSnackbar({ message: 'Could not change your groups', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }, [enqueueSnackbar])

  if (blocked) return null

  return (
    <Button onClick={apply} disabled={busy} data-testid="serial-group-allow-btn">
      {busy ? 'Waiting for authorization…' : 'Run command'}
    </Button>
  )
}

const LaterButton = (): JSX.Element => {
  const setOpen = useSerialGroupZustand((z) => z.setOpen)
  return (
    <Button onClick={() => setOpen(false)} data-testid="serial-group-later-btn">
      Later
    </Button>
  )
}

const LogoutButton = (): JSX.Element => {
  const setOpen = useSerialGroupZustand((z) => z.setOpen)
  const { enqueueSnackbar } = useSnackbar()

  const logout = useCallback(async (): Promise<void> => {
    const asked = await window.api.requestLogout()
    if (!asked) {
      enqueueSnackbar({
        message: 'Log out and back in yourself for the group to take effect.',
        variant: 'info'
      })
    }
    setOpen(false)
  }, [enqueueSnackbar, setOpen])

  return (
    <Button onClick={logout} data-testid="serial-group-logout-btn">
      Log out now
    </Button>
  )
}

const Actions = (): JSX.Element => {
  const done = useSerialGroupZustand((z) => z.done)
  return (
    <DialogActions sx={{ px: 3, pb: 2 }}>
      {done ? (
        <>
          <LaterButton />
          <LogoutButton />
        </>
      ) : (
        <>
          <NotNowButton />
          <RunCommandButton />
        </>
      )}
    </DialogActions>
  )
}

//
//
// Title
const Title = (): JSX.Element => {
  const group = useSerialGroupZustand((z) => z.status?.group)
  return <DialogTitle>Serial ports need the {group} group</DialogTitle>
}

//
//
// MAIN
interface Props {
  /** True while RTU is the selected transport. The check runs then, and only then. */
  active: boolean
}

const SerialGroupModal = ({ active }: Props): JSX.Element | null => {
  const open = useSerialGroupZustand((z) => z.open)
  const hasStatus = useSerialGroupZustand((z) => z.status !== null)

  useEffect(() => {
    if (!active) return
    let cancelled = false

    const check = async (): Promise<void> => {
      const { declined, setStatus, setDone, setOpen } = useSerialGroupZustand.getState()
      if (declined) return
      try {
        const result = await window.api.getSerialGroupStatus()
        if (cancelled) return
        // Close rather than return: the store outlives a remount, so a stale
        // open would otherwise keep an answered question on screen.
        if (!result.needsMembership && !result.pendingLogin) return setOpen(false)
        setStatus(result)
        setDone(result.pendingLogin)
        setOpen(true)
      } catch {
        // Detection is a convenience. Never let it break the client view.
      }
    }
    check()

    return (): void => {
      cancelled = true
    }
  }, [active])

  if (!hasStatus) return null

  return (
    <Dialog
      open={open}
      // Read busy rather than subscribe to it: the shell has no other reason
      // to re-render while the command runs.
      onClose={() => !useSerialGroupZustand.getState().busy && decline()}
      maxWidth="sm"
      fullWidth
      data-testid="serial-group-modal"
    >
      <Title />
      <DialogContent>
        <Body />
      </DialogContent>
      <Actions />
    </Dialog>
  )
}

export default SerialGroupModal

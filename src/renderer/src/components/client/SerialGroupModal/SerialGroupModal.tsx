import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import CommandBlock from '@renderer/components/shared/CommandBlock'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useRootZustand } from '@renderer/context/root.zustand'
import { SerialGroupStatus, serialGroupCommandDisplay } from '@shared'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect } from 'react'
import { useSerialGroupZustand } from './serialGroupModal.zustand'

/**
 * Linux serial group modal
 *
 * A serial port belongs to a group, and a user outside it opens nothing. The
 * port is still listed -- udev enumerates it without touching the device -- so
 * nothing looks wrong until the connect fails, and the answer is a command
 * documented where nobody looks.
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
const Command = meme((): JSX.Element => {
  const username = useSerialGroupZustand((z) => z.status?.username)
  // The group the refusing device actually belongs to, not an assumed dialout.
  const group = useSerialGroupZustand((z) => z.status?.group)
  return (
    <CommandBlock
      command={serialGroupCommandDisplay(username ?? '$USER', group)}
      testId="serial-group-command"
    />
  )
})

//
//
// After the command has run: in the file, not yet in the session
const PendingLogin = meme((): JSX.Element => {
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
      in before Modbux can open a port.
    </Alert>
  )
})

//
//
// Before it has run: what is wrong, and what will fix it
const Explanation = meme((): JSX.Element => {
  const group = useSerialGroupZustand((z) => z.status?.group)
  const username = useSerialGroupZustand((z) => z.status?.username)
  // A string or null, so it compares by value like any other primitive.
  const blocked = useSerialGroupZustand((z) => blockedReason(z.status))

  return (
    <>
      <Typography variant="body2" sx={{ mb: 2 }}>
        On Linux a serial port belongs to the {group} group, and {username} is not in it. The port
        is still listed, but opening it is refused, so connecting fails until that changes.
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
})

//
//
// Body
const Body = meme((): JSX.Element => {
  const done = useSerialGroupZustand((z) => z.done)
  return done ? <PendingLogin /> : <Explanation />
})

//
//
// Buttons
const NotNowButton = meme((): JSX.Element => {
  const busy = useSerialGroupZustand((z) => z.busy)
  return (
    <Button onClick={decline} disabled={busy} data-testid="serial-group-close-btn">
      Not now
    </Button>
  )
})

const RunCommandButton = meme((): JSX.Element | null => {
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
})

const LaterButton = meme((): JSX.Element => {
  const setOpen = useSerialGroupZustand((z) => z.setOpen)
  return (
    <Button onClick={() => setOpen(false)} data-testid="serial-group-later-btn">
      Later
    </Button>
  )
})

const LogoutButton = meme((): JSX.Element => {
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
})

const Actions = meme((): JSX.Element => {
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
})

//
//
// Title
const Title = meme((): JSX.Element => {
  const group = useSerialGroupZustand((z) => z.status?.group)
  return <DialogTitle>Serial ports need the {group} group</DialogTitle>
})

//
//
// MAIN
interface SerialGroupModalProps {
  /** True while RTU is the selected transport. The check runs then, and only then. */
  active: boolean
}

const SerialGroupModal = meme(({ active }: SerialGroupModalProps): JSX.Element | null => {
  const open = useSerialGroupZustand((z) => z.open)
  const hasStatus = useSerialGroupZustand((z) => z.status !== null)

  // Which ports exist, as one string so it compares by value. Selecting RTU is
  // not the only moment this matters: plugging an adapter in afterwards is the
  // other one, and the list only changes when something is refreshed.
  const ports = useRootZustand((z) => z.serialPorts.map((p) => p.path).join(','))

  useEffect(() => {
    if (!active) return
    let cancelled = false

    const ask = async (): Promise<void> => {
      const opened = await useSerialGroupZustand.getState().check()
      // Switching back to TCP while the answer was in flight should not land
      // a serial question on the TCP tab.
      if (opened && cancelled) useSerialGroupZustand.getState().setOpen(false)
    }
    ask()

    return (): void => {
      cancelled = true
    }
  }, [active, ports])

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
})

export default SerialGroupModal

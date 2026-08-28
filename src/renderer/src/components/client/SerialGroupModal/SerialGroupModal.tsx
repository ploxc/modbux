import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography
} from '@mui/material'
import { ContentCopy, Check } from '@mui/icons-material'
import { SerialGroupStatus, serialGroupCommandDisplay } from '@shared'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect, useState } from 'react'

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

const CommandBlock = ({ command }: { command: string }): JSX.Element => {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be unavailable; the command stays selectable on screen.
    }
  }, [command])

  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderRadius: 1,
        border: `1px solid ${theme.palette.divider}`,
        // A shade up from the dialog surface, as the scan modals nest theirs.
        background: theme.palette.background.paper
      })}
    >
      <Typography
        variant="body2"
        sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}
        data-testid="serial-group-command"
      >
        {command}
      </Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton size="small" onClick={handleCopy} aria-label="Copy command">
          {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  )
}

/**
 * A no, for this run of the app only. Module scope rather than storage, so it
 * lives exactly as long as the window does.
 */
let declinedThisSession = false

interface Props {
  /** True while RTU is the selected transport. The check runs then, and only then. */
  active: boolean
}

const SerialGroupModal = ({ active }: Props): JSX.Element | null => {
  const [status, setStatus] = useState<SerialGroupStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    if (!active) return
    let cancelled = false

    const check = async (): Promise<void> => {
      if (declinedThisSession) return
      try {
        const result = await window.api.getSerialGroupStatus()
        if (cancelled) return
        if (!result.needsMembership && !result.pendingLogin) return
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

  const handleApply = useCallback(async (): Promise<void> => {
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

  const decline = useCallback((): void => {
    declinedThisSession = true
    setOpen(false)
  }, [])

  const handleLogout = useCallback(async (): Promise<void> => {
    const asked = await window.api.requestLogout()
    if (!asked) {
      enqueueSnackbar({
        message: 'Log out and back in yourself for the group to take effect.',
        variant: 'info'
      })
    }
    setOpen(false)
  }, [enqueueSnackbar])

  if (!status) return null

  const blockedReason = status.sandbox
    ? `Modbux is running inside ${status.sandbox === 'flatpak' ? 'Flatpak' : 'Snap'}, so it cannot change your groups itself.`
    : !status.canElevate
      ? 'pkexec is not installed, so Modbux cannot ask for permission itself.'
      : null

  return (
    <Dialog
      open={open}
      onClose={() => !busy && decline()}
      maxWidth="sm"
      fullWidth
      data-testid="serial-group-modal"
    >
      <DialogTitle>Serial ports need the {status.group} group</DialogTitle>

      <DialogContent>
        {done ? (
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
            You are in {status.group} now. A session keeps the groups it was given at login, so log
            out and back in before the ports appear.
          </Alert>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 2 }}>
              On Linux a serial port belongs to the {status.group} group, and {status.username} is
              not in it. Until that changes, Modbux lists no ports at all, whatever is plugged in.
            </Typography>

            {blockedReason ? (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  {blockedReason} Run this in a terminal instead:
                </Alert>
                <CommandBlock command={serialGroupCommandDisplay(status.username ?? '$USER')} />
              </>
            ) : (
              <>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Modbux can do it for you. You will be asked for your password, and this is what
                  will run:
                </Typography>
                <CommandBlock command={serialGroupCommandDisplay(status.username ?? '$USER')} />
              </>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {done ? (
          <>
            <Button onClick={() => setOpen(false)} data-testid="serial-group-later-btn">
              Later
            </Button>
            <Button
              variant="contained"
              onClick={handleLogout}
              data-testid="serial-group-logout-btn"
            >
              Log out now
            </Button>
          </>
        ) : (
          <>
            <Button onClick={decline} disabled={busy} data-testid="serial-group-close-btn">
              Not now
            </Button>
            {!blockedReason && (
              <Button
                variant="contained"
                onClick={handleApply}
                disabled={busy}
                data-testid="serial-group-allow-btn"
              >
                {busy ? 'Waiting for authorization…' : 'Run command'}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default SerialGroupModal

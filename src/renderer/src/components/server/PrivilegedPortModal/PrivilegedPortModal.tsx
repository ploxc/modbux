import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Checkbox,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import { ContentCopy, Check } from '@mui/icons-material'
import { useServerZustand } from '@renderer/context/server.zustand'
import {
  PrivilegedPortFixMode,
  PrivilegedPortStatus,
  privilegedPortCommandDisplay,
  UNPRIVILEGED_PORT_START_TARGET
} from '@shared'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect, useState } from 'react'

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
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        pl: 1.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        border: 1,
        borderColor: 'divider'
      }}
    >
      <Typography
        component="code"
        data-testid="privileged-port-command"
        sx={{
          flex: 1,
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          userSelect: 'all',
          wordBreak: 'break-all'
        }}
      >
        {command}
      </Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton size="small" onClick={handleCopy} data-testid="privileged-port-copy-btn">
          {copied ? <Check fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  )
}

const PrivilegedPortModal = (): JSX.Element | null => {
  const { enqueueSnackbar } = useSnackbar()
  const [status, setStatus] = useState<PrivilegedPortStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dontAsk, setDontAsk] = useState(false)
  // Drives both the command on screen and the command that runs, so the two
  // can never drift apart.
  const [mode, setMode] = useState<PrivilegedPortFixMode>('persist')

  // Where the server actually landed. When 502 is blocked the backend has
  // already walked up to the first bindable port, so this is the fallback the
  // user is looking at — not the port they asked for.
  const actualPort = useServerZustand((z) => Number(z.port[z.selectedUuid] ?? 0))
  const ready = useServerZustand((z) => !!z.ready[z.selectedUuid])

  useEffect(() => {
    // The popped-out server window would otherwise show a second copy.
    if (window.api.isServerWindow) return
    if (localStorage.getItem(DISMISS_KEY) === 'true') return
    if (!ready) return

    let cancelled = false
    const check = async (): Promise<void> => {
      try {
        // Always ask about 502 rather than the port in use. By the time the
        // view renders, an unbindable 502 has already become 1024, and asking
        // about 1024 would report no problem at all.
        const result = await window.api.getPrivilegedPortStatus(UNPRIVILEGED_PORT_START_TARGET)
        if (cancelled || !result.needsElevation) return
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

  const close = useCallback((): void => {
    if (dontAsk) localStorage.setItem(DISMISS_KEY, 'true')
    setOpen(false)
  }, [dontAsk])

  const handleApply = useCallback(async (): Promise<void> => {
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
  }, [enqueueSnackbar, mode])

  if (!status) return null

  const blockedReason = status.sandbox
    ? `Modbux is running inside ${status.sandbox === 'flatpak' ? 'Flatpak' : 'Snap'}, so it cannot change system settings itself.`
    : !status.canElevate
      ? 'pkexec is not installed, so Modbux cannot ask for permission itself.'
      : null

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth data-testid="privileged-port-modal">
      <DialogTitle>Port {status.port} needs a system setting</DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Linux reserves ports below {status.unprivilegedPortStart} for root, and Modbus uses{' '}
          {status.port} by default.{' '}
          {actualPort && actualPort !== status.port
            ? `That is why this server is on ${actualPort} instead — a client looking for ${status.port} will not find it.`
            : `Until that floor is lowered, Modbux cannot use it and clients looking for ${status.port} will not find it.`}
        </Typography>

        {blockedReason ? (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              {blockedReason} Run this in a terminal instead:
            </Alert>
            <CommandBlock command={privilegedPortCommandDisplay('persist')} />
          </>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Modbux can lower it for you. This makes every port from{' '}
              {UNPRIVILEGED_PORT_START_TARGET} up bindable without root, system-wide — you will be
              asked for your password.
            </Typography>

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

            <Typography variant="body2" sx={{ mb: 1 }}>
              This is what will run:
            </Typography>
            <CommandBlock command={privilegedPortCommandDisplay(mode)} />
          </>
        )}

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
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={busy} data-testid="privileged-port-cancel-btn">
          Not now
        </Button>
        {!blockedReason && (
          <Button
            variant="contained"
            onClick={handleApply}
            disabled={busy}
            data-testid="privileged-port-allow-btn"
          >
            {busy ? 'Waiting for authorization…' : 'Run command'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default PrivilegedPortModal

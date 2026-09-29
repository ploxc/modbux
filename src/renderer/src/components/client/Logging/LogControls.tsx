import ShowChart from '@mui/icons-material/ShowChart'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { textMuted } from '@renderer/theme'
import { ClientUnit, loggedRegisterCount } from '@shared'
import { MouseEvent, useCallback, useEffect, useState } from 'react'
import LogStatusPopover from './LogStatusPopover'
import StartLogDialog from './StartLogDialog'
import { formatCount, formatDuration } from './format'

const NO_UNITS: ClientUnit[] = []

/**
 * What the current run has lasted and taken, redrawn every second while it
 * runs. A log that is on while the client does not poll waits for the poll,
 * and one that is off shows what it still holds.
 */
const LogChip = meme(({ onOpen }: { onOpen: (event: MouseEvent<HTMLElement>) => void }) => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const enabled = useLiveZustand((z) => dataOf(z, uuid).clientState.log.enabled)
  const running = useLiveZustand((z) => dataOf(z, uuid).clientState.log.running)
  const samples = useLiveZustand((z) => dataOf(z, uuid).clientState.log.samples)
  const runStart = useLiveZustand((z) => dataOf(z, uuid).clientState.log.runs.at(-1)?.start)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return (): void => clearInterval(timer)
  }, [running])

  return (
    <ButtonBase
      data-testid="log-status-chip"
      onClick={onOpen}
      sx={(theme) => ({
        height: 28,
        px: 1.25,
        gap: 1,
        borderRadius: '14px',
        fontSize: 12,
        color: theme.palette.success.light,
        background: alpha(theme.palette.success.main, 0.14)
      })}
    >
      <ShowChart sx={{ fontSize: 16 }} />
      {enabled ? 'Logging' : 'Log'}
      {enabled && (
        <>
          <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
            {running && runStart !== undefined
              ? formatDuration(now - runStart)
              : 'waiting for Poll'}
          </Box>
          <Box component="span" sx={{ color: textMuted }}>
            ·
          </Box>
        </>
      )}
      <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
        {formatCount(samples)} samples
      </Box>
    </ButtonBase>
  )
})

/**
 * Logging in Monitor's toolbar. Off, it counts the registers that log and
 * offers Enable logging, which stays disabled until one does. On, it shows
 * Stop logging. The log's chip opens the log whenever it holds samples or
 * logging is on.
 */
const LogControls = meme((): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const logged = useClientZustand((z) =>
    loggedRegisterCount(z.clients[z.selectedUuid]?.units ?? NO_UNITS)
  )
  const enabled = useLiveZustand((z) => dataOf(z, uuid).clientState.log.enabled)
  const samples = useLiveZustand((z) => dataOf(z, uuid).clientState.log.samples)
  const [asking, setAsking] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  // A log holding samples asks whether to add to them; an empty one starts.
  const handleEnable = useCallback(() => {
    if (samples > 0) {
      setAsking(true)
      return
    }
    void window.api.startLog({ uuid, append: false })
  }, [uuid, samples])
  const handleStop = useCallback(() => {
    void window.api.stopLog(uuid)
  }, [uuid])
  const handleCloseAsking = useCallback(() => setAsking(false), [])
  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])

  if (!enabled) {
    return (
      <>
        {samples > 0 && <LogChip onOpen={handleOpen} />}
        <Box
          component="span"
          data-testid="log-count"
          sx={{ fontSize: 12, color: logged > 0 ? textMuted : 'text.disabled' }}
        >
          {logged === 0
            ? 'No register logs; set Log in Debug'
            : `${logged} ${logged === 1 ? 'register logs' : 'registers log'}`}
        </Box>
        <Button
          data-testid="log-enable-btn"
          size="medium"
          variant="outlined"
          color="success"
          disabled={logged === 0}
          startIcon={<ShowChart />}
          onClick={handleEnable}
        >
          Enable logging
        </Button>
        {asking && <StartLogDialog onClose={handleCloseAsking} />}
        {anchor && <LogStatusPopover anchor={anchor} onClose={handleClose} />}
      </>
    )
  }

  return (
    <>
      <LogChip onOpen={handleOpen} />
      <Button
        data-testid="log-stop-btn"
        size="medium"
        variant="outlined"
        color="success"
        onClick={handleStop}
      >
        Stop logging
      </Button>
      {anchor && <LogStatusPopover anchor={anchor} onClose={handleClose} />}
    </>
  )
})

export default LogControls

import ShowChart from '@mui/icons-material/ShowChart'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import { alpha } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { textMuted } from '@renderer/theme'
import { ClientLogCapacitySchema, ClientUnit, LogRun, loggedRegisterCount } from '@shared'
import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { formatCount, formatDuration, formatTime, logFill } from './format'
import LogOffDialog from './LogOffDialog'
import { enableLog } from './enableLog'
import ExportLogDialog from './ExportLog/ExportLogDialog'

const NO_UNITS: ClientUnit[] = []

interface LogStatusPopoverProps {
  anchor: HTMLElement
  onClose: () => void
}

/** The last run that ended, which the gap after it is about. */
const lastEnded = (state: Parameters<typeof dataOf>[0], uuid: string): LogRun | undefined =>
  dataOf(state, uuid).clientState.log.runs.findLast((run) => run.end !== undefined)

/** How many runs the log holds, and when and why the last of them ended. */
const RunsLine = meme(({ uuid }: { uuid: string }): JSX.Element => {
  const runCount = useLiveZustand((z) => dataOf(z, uuid).clientState.log.runs.length)
  const gapAt = useLiveZustand((z) => lastEnded(z, uuid)?.end)
  const gapReason = useLiveZustand((z) => lastEnded(z, uuid)?.reason)
  return (
    <>
      {runCount}
      {gapAt !== undefined && `, the last ended at ${formatTime(gapAt)}: ${gapReason ?? ''}`}
    </>
  )
})

/**
 * Whether logging is on, and while it runs, for how long, redrawn every
 * second. On while the client does not poll, it says what starts it: the
 * button beside, which reads Log then.
 */
const LogHeading = meme(({ uuid }: { uuid: string }): JSX.Element => {
  const enabled = useLiveZustand((z) => dataOf(z, uuid).clientState.log.enabled)
  const running = useLiveZustand((z) => dataOf(z, uuid).clientState.log.running)
  const runStart = useLiveZustand((z) => dataOf(z, uuid).clientState.log.runs.at(-1)?.start)
  const logged = useClientZustand((z) => loggedRegisterCount(z.clients[uuid]?.units ?? NO_UNITS))
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return (): void => clearInterval(timer)
  }, [running])

  return (
    <Box
      data-testid="log-status-heading"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.light' }}
    >
      <ShowChart sx={{ fontSize: 16, color: 'success.main' }} />
      {running && runStart !== undefined ? (
        <>
          Logging for
          <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
            {formatDuration(now - runStart)}
          </Box>
        </>
      ) : enabled ? (
        'Logging is on; press Log to start'
      ) : (
        'Logging is off'
      )}
      <Box component="span" sx={{ color: textMuted }}>
        · {logged} {logged === 1 ? 'register' : 'registers'}
      </Box>
    </Box>
  )
})

/**
 * The log of the selected client: how full it is, the oldest sample it still
 * holds, what it overwrote and where its runs broke off, the size it keeps
 * for this session, and Clear log.
 */
const LogStatusPopover = meme(({ anchor, onClose }: LogStatusPopoverProps): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const samples = useLiveZustand((z) => dataOf(z, uuid).clientState.log.samples)
  const capacity = useLiveZustand((z) => dataOf(z, uuid).clientState.log.capacity)
  const overwritten = useLiveZustand((z) => dataOf(z, uuid).clientState.log.overwritten)
  const oldest = useLiveZustand((z) => dataOf(z, uuid).clientState.log.oldest)
  const [capacityText, setCapacityText] = useState(String(capacity))
  const capacityValid = ClientLogCapacitySchema.shape.capacity.safeParse(
    Number(capacityText)
  ).success

  const handleCapacity = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCapacityText(event.target.value)
  }, [])
  // A size is taken when the field is left or Enter is pressed, because
  // shrinking the log drops what no longer fits.
  const commitCapacity = useCallback(() => {
    const parsed = ClientLogCapacitySchema.safeParse({ uuid, capacity: Number(capacityText) })
    if (parsed.success) void window.api.setLogCapacity(parsed.data)
  }, [uuid, capacityText])
  const handleCapacityKey = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') commitCapacity()
    },
    [commitCapacity]
  )
  const handleClear = useCallback(() => {
    void window.api.clearLog(uuid)
  }, [uuid])
  const [exporting, setExporting] = useState(false)
  const handleExportOpen = useCallback(() => setExporting(true), [])
  const handleExportClose = useCallback(() => setExporting(false), [])

  // Turning logging on over samples chooses between appending to them and a
  // new log. Turning it off while the client polls asks first, because the
  // poll goes on without it.
  const enabled = useLiveZustand((z) => dataOf(z, uuid).clientState.log.enabled)
  const logged = useClientZustand((z) => loggedRegisterCount(z.clients[uuid]?.units ?? NO_UNITS))
  const handleOn = useCallback(() => {
    enableLog(uuid, false)
    onClose()
  }, [uuid, onClose])
  const handleAppend = useCallback(() => {
    enableLog(uuid, true)
    onClose()
  }, [uuid, onClose])
  const polling = useLiveZustand((z) => dataOf(z, uuid).clientState.polling)
  const [askingOff, setAskingOff] = useState(false)
  const turnOff = useCallback(() => {
    void window.api.stopLog(uuid)
    onClose()
  }, [uuid, onClose])
  const handleTurnOff = useCallback(() => {
    if (polling) setAskingOff(true)
    else turnOff()
  }, [polling, turnOff])
  const handleCloseAskingOff = useCallback(() => setAskingOff(false), [])

  return (
    <Popover
      open
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      slotProps={{ paper: { sx: { p: 1.75, width: 400 } } }}
    >
      <Box
        data-testid="log-status-popover"
        sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, fontSize: 12.5 }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <LogHeading uuid={uuid} />
          <Box
            role="progressbar"
            aria-label="Log fill"
            aria-valuenow={Math.round(Math.min(100, (samples / capacity) * 100))}
            sx={(theme) => ({
              height: 6,
              borderRadius: '3px',
              overflow: 'hidden',
              background: alpha(theme.palette.success.main, 0.2)
            })}
          >
            <Box
              data-testid="log-status-fill"
              // The width moves with every poll, and a value in `sx` would be a
              // new class each time.
              style={{ width: logFill(samples, capacity) }}
              sx={{ height: '100%', bgcolor: 'success.main' }}
            />
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '120px minmax(0, 1fr)',
              rowGap: 0.5,
              '& > :nth-of-type(odd)': { color: textMuted }
            }}
          >
            <span>Samples</span>
            <Box component="span" data-testid="log-status-samples" sx={{ fontFamily: 'monospace' }}>
              {formatCount(samples)} of {formatCount(capacity)}
            </Box>
            <span>Oldest</span>
            <Box component="span" sx={{ fontFamily: 'monospace' }}>
              {formatTime(oldest) || '–'}
            </Box>
            <span>Overwritten</span>
            <Box component="span" sx={{ fontFamily: 'monospace' }}>
              {formatCount(overwritten)}
            </Box>
            <span>Runs</span>
            <span>
              <RunsLine uuid={uuid} />
            </span>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <span>Log size</span>
          <TextField
            size="medium"
            value={capacityText}
            error={!capacityValid}
            onChange={handleCapacity}
            onBlur={commitCapacity}
            onKeyDown={handleCapacityKey}
            slotProps={{
              htmlInput: {
                inputMode: 'numeric',
                'aria-label': 'Log size',
                'data-testid': 'log-capacity-input'
              }
            }}
            sx={{ width: 110 }}
          />
          <Box component="span" sx={{ color: textMuted }}>
            samples, oldest overwritten
          </Box>
        </Box>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            pt: 1.5
          }}
        >
          <Button
            data-testid="log-export-open-btn"
            size="medium"
            variant="outlined"
            disabled={samples === 0}
            onClick={handleExportOpen}
          >
            Export CSV…
          </Button>
          <Button
            data-testid="log-clear-btn"
            size="medium"
            variant="text"
            color="error"
            onClick={handleClear}
          >
            Clear log
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          {enabled ? (
            <Button
              data-testid="log-turn-off-btn"
              size="medium"
              variant="outlined"
              color="success"
              onClick={handleTurnOff}
            >
              Turn logging off
            </Button>
          ) : logged === 0 ? (
            <Box component="span" sx={{ color: textMuted }}>
              No register logs; set Log in Debug
            </Box>
          ) : samples > 0 ? (
            <>
              <Button
                data-testid="log-start-new-btn"
                size="medium"
                variant="text"
                color="success"
                title="Clear the log and start a new one"
                onClick={handleOn}
              >
                Start new
              </Button>
              <Button
                data-testid="log-start-append-btn"
                size="medium"
                variant="contained"
                color="success"
                title="Log on after the samples it holds, with a gap between the runs"
                onClick={handleAppend}
              >
                Append
              </Button>
            </>
          ) : (
            <Button
              data-testid="log-turn-on-btn"
              size="medium"
              variant="contained"
              color="success"
              onClick={handleOn}
            >
              Turn logging on
            </Button>
          )}
        </Box>
      </Box>
      {exporting && <ExportLogDialog onClose={handleExportClose} />}
      {askingOff && <LogOffDialog onOff={turnOff} onClose={handleCloseAskingOff} />}
    </Popover>
  )
})

export default LogStatusPopover

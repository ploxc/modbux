import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { textMuted } from '@renderer/theme'
import { ClientLogCapacitySchema, LogRun } from '@shared'
import { ChangeEvent, KeyboardEvent, useCallback, useState } from 'react'
import { formatCount, formatTime } from './format'
import ExportLogDialog from './ExportLog/ExportLogDialog'

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

  return (
    <Popover
      open
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { p: 1.75, width: 400 } } }}
    >
      <Box
        data-testid="log-status-popover"
        sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, fontSize: 12.5 }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <LinearProgress
            variant="determinate"
            color="success"
            value={Math.min(100, (samples / capacity) * 100)}
            sx={{ height: 6, borderRadius: 3 }}
          />
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
            justifyContent: 'space-between',
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
        </Box>
      </Box>
      {exporting && <ExportLogDialog onClose={handleExportClose} />}
    </Popover>
  )
})

export default LogStatusPopover

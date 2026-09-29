import ShowChart from '@mui/icons-material/ShowChart'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogHeading from '@renderer/components/shared/DialogHeading'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { useCallback, useState } from 'react'
import { ClientUnit, loggedRegisterCount } from '@shared'
import ExportLogDialog from './ExportLog/ExportLogDialog'
import { enableLog } from './enableLog'
import { formatCount, formatTime } from './format'

/**
 * Enable logging over a log that holds samples: append to them, with a gap
 * between the two runs, or start a new log, which clears them. The samples
 * can be exported first.
 */
const NO_UNITS: ClientUnit[] = []

const StartLogDialog = meme(({ onClose }: { onClose: () => void }): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const name = useClientZustand((z) => z.clients[z.selectedUuid]?.name)
  const samples = useLiveZustand((z) => dataOf(z, uuid).clientState.log.samples)
  const oldest = useLiveZustand((z) => dataOf(z, uuid).clientState.log.oldest)
  const lastEnd = useLiveZustand((z) => dataOf(z, uuid).clientState.log.runs.at(-1)?.end)
  // With no register logging there is nothing to start, and the samples can
  // still be exported.
  const logged = useClientZustand((z) =>
    loggedRegisterCount(z.clients[z.selectedUuid]?.units ?? NO_UNITS)
  )

  const handleNew = useCallback(() => {
    enableLog(uuid, false)
    onClose()
  }, [uuid, onClose])
  const [exporting, setExporting] = useState(false)
  const handleExportOpen = useCallback(() => setExporting(true), [])
  const handleExportClose = useCallback(() => setExporting(false), [])
  const handleAppend = useCallback(() => {
    enableLog(uuid, true)
    onClose()
  }, [uuid, onClose])

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogHeading icon={<ShowChart />} tone="success">
        Start logging {name || 'Unnamed client'}
      </DialogHeading>
      <DialogContent>
        <DialogContentText>
          The log holds {formatCount(samples)} samples, from {formatTime(oldest)} to{' '}
          {formatTime(lastEnd)}.{' '}
          {logged === 0
            ? 'No register logs now; set Log in Debug to log again.'
            : 'Append to them, with a gap between the two runs, or start a new log, which clears them.'}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {/* The one place a log that is off still exports from. */}
        <Button
          data-testid="log-start-export-btn"
          variant="outlined"
          onClick={handleExportOpen}
          sx={{ mr: 'auto' }}
        >
          Export CSV…
        </Button>
        <Button data-testid="log-start-cancel-btn" variant="text" onClick={onClose}>
          Cancel
        </Button>
        {logged > 0 && (
          <>
            <Button data-testid="log-start-new-btn" variant="text" onClick={handleNew}>
              Start new
            </Button>
            <Button data-testid="log-start-append-btn" onClick={handleAppend}>
              Append
            </Button>
          </>
        )}
      </DialogActions>
      {exporting && <ExportLogDialog onClose={handleExportClose} />}
    </Dialog>
  )
})

export default StartLogDialog

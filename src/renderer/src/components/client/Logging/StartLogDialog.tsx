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
import { useCallback } from 'react'
import { enableLog } from './enableLog'
import { formatCount, formatTime } from './format'

/**
 * Enable logging over a log that holds samples: append to them, with a gap
 * between the two runs, or start a new log, which clears them.
 */
const StartLogDialog = meme(({ onClose }: { onClose: () => void }): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const name = useClientZustand((z) => z.clients[z.selectedUuid]?.name)
  const samples = useLiveZustand((z) => dataOf(z, uuid).clientState.log.samples)
  const oldest = useLiveZustand((z) => dataOf(z, uuid).clientState.log.oldest)
  const lastEnd = useLiveZustand((z) => dataOf(z, uuid).clientState.log.runs.at(-1)?.end)

  const handleNew = useCallback(() => {
    enableLog(uuid, false)
    onClose()
  }, [uuid, onClose])
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
          {formatTime(lastEnd)}. Append to them, with a gap between the two runs, or start a new
          log, which clears them.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button data-testid="log-start-cancel-btn" variant="text" onClick={onClose}>
          Cancel
        </Button>
        <Button data-testid="log-start-new-btn" variant="text" onClick={handleNew}>
          Start new
        </Button>
        <Button data-testid="log-start-append-btn" onClick={handleAppend}>
          Append
        </Button>
      </DialogActions>
    </Dialog>
  )
})

export default StartLogDialog

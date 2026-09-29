import ShowChart from '@mui/icons-material/ShowChart'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogHeading from '@renderer/components/shared/DialogHeading'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useCallback } from 'react'

interface LogOffDialogProps {
  onOff: () => void
  onClose: () => void
}

/** Turn logging off pressed while the client polls: the log stops, the poll goes on. */
const LogOffDialog = meme(({ onOff, onClose }: LogOffDialogProps): JSX.Element => {
  const name = useClientZustand((z) => z.clients[z.selectedUuid]?.name)
  const handleOff = useCallback(() => {
    onOff()
    onClose()
  }, [onOff, onClose])

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogHeading icon={<ShowChart />} tone="success">
        Turn logging off for {name || 'Unnamed client'}?
      </DialogHeading>
      <DialogContent>
        <DialogContentText>
          The log stops taking samples; polling continues. The samples taken so far stay.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button data-testid="log-off-keep-btn" variant="text" onClick={onClose}>
          Keep logging
        </Button>
        <Button data-testid="log-off-confirm-btn" onClick={handleOff}>
          Turn off, keep polling
        </Button>
      </DialogActions>
    </Dialog>
  )
})

export default LogOffDialog

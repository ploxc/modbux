import ShowChart from '@mui/icons-material/ShowChart'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import FormControlLabel from '@mui/material/FormControlLabel'
import DialogHeading from '@renderer/components/shared/DialogHeading'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { ClientUnit, loggedRegisterCount } from '@shared'
import { ChangeEvent, useCallback, useState } from 'react'

const NO_UNITS: ClientUnit[] = []

/** Ticked in the dialog, until the app closes. */
let dontAsk = false

/** Whether stopping a logging client's poll asks first. */
export const asksBeforeStoppingPoll = (): boolean => !dontAsk

interface StopPollDialogProps {
  onStop: () => void
  onClose: () => void
}

/**
 * Poll pressed while the client logs: stopping the poll stops the log, and
 * the log keeps its samples and marks the gap.
 */
const StopPollDialog = meme(({ onStop, onClose }: StopPollDialogProps): JSX.Element => {
  const name = useClientZustand((z) => z.clients[z.selectedUuid]?.name)
  const logged = useClientZustand((z) =>
    loggedRegisterCount(z.clients[z.selectedUuid]?.units ?? NO_UNITS)
  )
  const [ticked, setTicked] = useState(false)

  const handleTick = useCallback((_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
    setTicked(checked)
  }, [])
  const handleStop = useCallback(() => {
    dontAsk = ticked
    onStop()
    onClose()
  }, [ticked, onStop, onClose])

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogHeading icon={<ShowChart />} tone="success">
        Stop polling {name || 'Unnamed client'}?
      </DialogHeading>
      <DialogContent>
        <DialogContentText>
          {logged} {logged === 1 ? 'register is' : 'registers are'} logging; stopping the poll stops
          the log. The samples taken so far stay, and the log shows the gap with its reason.
        </DialogContentText>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={ticked}
              onChange={handleTick}
              slotProps={{ input: { 'aria-label': "Don't ask again this session" } }}
              data-testid="stop-poll-dont-ask"
            />
          }
          label="Don't ask again this session"
          sx={{ '& .MuiFormControlLabel-label': { fontSize: 13 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button data-testid="stop-poll-keep-btn" variant="text" onClick={onClose}>
          Keep polling
        </Button>
        <Button data-testid="stop-poll-confirm-btn" color="error" onClick={handleStop}>
          Stop anyway
        </Button>
      </DialogActions>
    </Dialog>
  )
})

export default StopPollDialog

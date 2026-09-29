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

/** What stops the log: the poll stopping, or the connection going. */
type Stopping = 'poll' | 'disconnect'

/** Ticked in the dialog, per kind, until the app closes. */
const dontAsk: Record<Stopping, boolean> = { poll: false, disconnect: false }

/** Whether stopping a logging client's poll asks first. */
export const asksBeforeStoppingPoll = (): boolean => !dontAsk.poll

/** Whether disconnecting a logging client asks first. */
export const asksBeforeDisconnecting = (): boolean => !dontAsk.disconnect

const TEXTS: Record<
  Stopping,
  { title: string; verb: string; keep: string; confirm: string; testId: string }
> = {
  poll: {
    title: 'Stop polling',
    verb: 'stopping the poll',
    keep: 'Keep polling',
    confirm: 'Stop anyway',
    testId: 'stop-poll'
  },
  disconnect: {
    title: 'Disconnect',
    verb: 'disconnecting',
    keep: 'Stay connected',
    confirm: 'Disconnect anyway',
    testId: 'disconnect-log'
  }
}

interface StopPollDialogProps {
  onStop: () => void
  onClose: () => void
  /** What the press stops; the poll unless said otherwise. */
  stopping?: Stopping
}

/**
 * Poll or Disconnect pressed while the client logs: either stops the log, and
 * the log keeps its samples and marks the gap.
 */
const StopPollDialog = meme(
  ({ onStop, onClose, stopping = 'poll' }: StopPollDialogProps): JSX.Element => {
    const texts = TEXTS[stopping]
    const name = useClientZustand((z) => z.clients[z.selectedUuid]?.name)
    const logged = useClientZustand((z) =>
      loggedRegisterCount(z.clients[z.selectedUuid]?.units ?? NO_UNITS)
    )
    const [ticked, setTicked] = useState(false)

    const handleTick = useCallback((_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      setTicked(checked)
    }, [])
    const handleStop = useCallback(() => {
      dontAsk[stopping] = ticked
      onStop()
      onClose()
    }, [ticked, stopping, onStop, onClose])

    return (
      <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
        <DialogHeading icon={<ShowChart />} tone="success">
          {texts.title} {name || 'Unnamed client'}?
        </DialogHeading>
        <DialogContent>
          <DialogContentText>
            {logged} {logged === 1 ? 'register is' : 'registers are'} logging; {texts.verb} stops
            the log. The samples taken so far stay, and the log shows the gap with its reason.
          </DialogContentText>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={ticked}
                onChange={handleTick}
                slotProps={{ input: { 'aria-label': "Don't ask again this session" } }}
                data-testid={`${texts.testId}-dont-ask`}
              />
            }
            label="Don't ask again this session"
            sx={{ '& .MuiFormControlLabel-label': { fontSize: 13 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button data-testid={`${texts.testId}-keep-btn`} variant="text" onClick={onClose}>
            {texts.keep}
          </Button>
          <Button data-testid={`${texts.testId}-confirm-btn`} color="error" onClick={handleStop}>
            {texts.confirm}
          </Button>
        </DialogActions>
      </Dialog>
    )
  }
)

export default StopPollDialog

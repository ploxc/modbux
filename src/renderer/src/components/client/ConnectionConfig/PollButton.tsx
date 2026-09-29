import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { ClientUnit, clientOwner, loggedRegisterCount } from '@shared'
import { useCallback, useState } from 'react'
import StopPollDialog, {
  asksBeforeStoppingPoll
} from '@renderer/components/client/Logging/StopPollDialog'
import { useClientViewZustand } from '@renderer/context/clientView.zustand'
import {
  pollsNothingOf,
  selectedClientUuid,
  useClientZustand
} from '@renderer/context/client.zustand'

const NO_UNITS: ClientUnit[] = []

const PollButton = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const notConnected = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'connected'
  )

  // What main would refuse a start for. `exceptPolling` is what keeps the
  // press that stops one: during a poll nothing else can own the client, so
  // this is undefined and the button is the Stop button.
  const owner = useLiveZustand((z) =>
    clientOwner(dataOf(z, selectedUuid).clientState, { exceptPolling: true })
  )
  const polling = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.polling)
  // What main refuses as a poll of no registers: no unit has a section to read.
  const monitor = useClientViewZustand((z) => z.view === 'monitor')
  const pollsNothing = useClientZustand((z) => pollsNothingOf(z, z.selectedUuid, monitor))
  // A client that logs is read for its log, whatever the screen polls.
  const logEnabled = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.log.enabled)
  const logRunning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.log.running)
  const logsSomething = useClientZustand(
    (z) => loggedRegisterCount(z.clients[z.selectedUuid]?.units ?? NO_UNITS) > 0
  )
  const readsNothing = pollsNothing && !(logEnabled && logsSomething)
  // A poll goes on through a reconnect, so the press that stops it does too.
  const disabled = (!polling && (notConnected || readsNothing)) || owner !== undefined
  const [asking, setAsking] = useState(false)

  const stopPolling = useCallback(() => {
    void window.api.stopPolling(selectedClientUuid())
  }, [])
  const togglePolling = useCallback(() => {
    const uuid = selectedClientUuid()
    if (!polling) {
      void window.api.startPolling(uuid)
      return
    }
    // Stopping the poll stops the log, which is asked about first.
    if (logRunning && asksBeforeStoppingPoll()) {
      setAsking(true)
      return
    }
    stopPolling()
  }, [polling, logRunning, stopPolling])
  const handleCloseAsking = useCallback(() => setAsking(false), [])

  const variant: ButtonProps['variant'] = polling ? 'contained' : 'outlined'
  const color: ButtonProps['color'] = polling ? 'warning' : 'primary'

  return (
    <>
      <Button
        data-testid="poll-btn"
        disabled={disabled}
        size="large"
        color={color}
        variant={variant}
        onClick={togglePolling}
      >
        Poll
      </Button>
      {asking && <StopPollDialog onStop={stopPolling} onClose={handleCloseAsking} />}
    </>
  )
})

export default PollButton

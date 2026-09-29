import Box from '@mui/material/Box'
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
  // A client that logs is read for its log, whatever the screen polls.
  const logEnabled = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.log.enabled)
  // What main refuses as a poll of no registers: no unit has a section to
  // read. Monitor polls while it is on screen, and while logging is on.
  const monitorShown = useClientViewZustand((z) => z.view === 'monitor')
  const monitor = monitorShown || logEnabled
  const pollsNothing = useClientZustand((z) => pollsNothingOf(z, z.selectedUuid, monitor))
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

  // While the log is on the button says so, in the log's colour: pressing it
  // starts or stops the log with the poll.
  const variant: ButtonProps['variant'] = polling ? 'contained' : 'outlined'
  const color: ButtonProps['color'] = logEnabled ? 'success' : 'primary'
  const label = logEnabled ? (polling ? 'Logging' : 'Log') : polling ? 'Polling' : 'Poll'

  return (
    <>
      <Button
        data-testid="poll-btn"
        disabled={disabled}
        size="large"
        color={color}
        variant={variant}
        onClick={togglePolling}
        // As wide as Logging or Polling with its dot, 90 px measured, so the top
        // bar does not shift between Poll, Polling, Log and Logging.
        sx={{ gap: 1, minWidth: 90 }}
      >
        {polling && (
          <Box
            component="span"
            data-testid="poll-btn-pulse"
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: 'currentColor',
              animation: 'pollButtonPulse 1.6s ease-in-out infinite',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              '@keyframes pollButtonPulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.25 }
              }
            }}
          />
        )}
        {label}
      </Button>
      {asking && <StopPollDialog onStop={stopPolling} onClose={handleCloseAsking} />}
    </>
  )
})

export default PollButton

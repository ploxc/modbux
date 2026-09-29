import ShowChart from '@mui/icons-material/ShowChart'
import Button from '@mui/material/Button'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { ClientUnit, loggedRegisterCount } from '@shared'
import { MouseEvent, useCallback, useState } from 'react'
import { enableLog } from './enableLog'
import LogStatusPopover from './LogStatusPopover'
import StartLogDialog from './StartLogDialog'

const NO_UNITS: ClientUnit[] = []

/**
 * The log, beside Poll in the top bar. Off, a press enables logging, asking
 * first whether to append when the log holds samples. On, it is lit and a
 * press opens the log. Greyed while no register logs and the log is empty.
 */
const LogButton = meme((): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const logged = useClientZustand((z) =>
    loggedRegisterCount(z.clients[z.selectedUuid]?.units ?? NO_UNITS)
  )
  const enabled = useLiveZustand((z) => dataOf(z, uuid).clientState.log.enabled)
  const samples = useLiveZustand((z) => dataOf(z, uuid).clientState.log.samples)
  const [asking, setAsking] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (enabled) {
        setAnchor(event.currentTarget)
        return
      }
      if (samples > 0) {
        setAsking(true)
        return
      }
      enableLog(uuid, false)
    },
    [uuid, enabled, samples]
  )
  const handleCloseAsking = useCallback(() => setAsking(false), [])
  const handleClose = useCallback(() => setAnchor(null), [])

  const title = enabled
    ? 'The log'
    : logged === 0
      ? samples === 0
        ? 'No register logs; set Log in Debug'
        : 'The log; no register logs now'
      : 'Enable logging'

  return (
    <>
      <Button
        data-testid="log-btn"
        aria-label={title}
        aria-pressed={enabled}
        title={title}
        disabled={!enabled && logged === 0 && samples === 0}
        size="large"
        variant="outlined"
        color="success"
        onClick={handleClick}
        sx={(theme) => ({
          minWidth: 0,
          px: 1,
          ...(enabled && { background: alpha(theme.palette.success.main, 0.22) })
        })}
      >
        <ShowChart fontSize="small" />
      </Button>
      {asking && <StartLogDialog onClose={handleCloseAsking} />}
      {anchor && <LogStatusPopover anchor={anchor} onClose={handleClose} />}
    </>
  )
})

export default LogButton

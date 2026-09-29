import ShowChart from '@mui/icons-material/ShowChart'
import Button from '@mui/material/Button'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { ClientUnit, loggedRegisterCount } from '@shared'
import { MouseEvent, useCallback, useState } from 'react'
import LogStatusPopover from './LogStatusPopover'

const NO_UNITS: ClientUnit[] = []

/**
 * The log, beside Poll in the top bar. A press opens the log, where logging is
 * turned on and off. Lit while logging is on, and greyed while no register
 * logs and the log is empty.
 */
const LogButton = meme((): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const logged = useClientZustand((z) =>
    loggedRegisterCount(z.clients[z.selectedUuid]?.units ?? NO_UNITS)
  )
  const enabled = useLiveZustand((z) => dataOf(z, uuid).clientState.log.enabled)
  const samples = useLiveZustand((z) => dataOf(z, uuid).clientState.log.samples)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])

  const title =
    logged === 0 && samples === 0 && !enabled ? 'No register logs; set Log in Debug' : 'The log'

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
        onClick={handleOpen}
        sx={(theme) => ({
          minWidth: 0,
          px: 1,
          ...(enabled && { background: alpha(theme.palette.success.main, 0.22) })
        })}
      >
        <ShowChart fontSize="small" />
      </Button>
      {anchor && <LogStatusPopover anchor={anchor} onClose={handleClose} />}
    </>
  )
})

export default LogButton

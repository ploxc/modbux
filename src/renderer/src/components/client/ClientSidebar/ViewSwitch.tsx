import TableRows from '@mui/icons-material/TableRows'
import WebAsset from '@mui/icons-material/WebAsset'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientViewZustand } from '@renderer/context/clientView.zustand'
import { ClientViewMode } from '@renderer/context/clientView.zustand.types'
import { useCallback } from 'react'

/**
 * Debug or Monitor: two labelled halves at the top of the sidebar, two icons
 * stacked at the top of the rail.
 */
const ViewSwitch = meme(({ rail = false }: { rail?: boolean }): JSX.Element => {
  const view = useClientViewZustand((z) => z.view)

  const handleChange = useCallback((_event: unknown, next: ClientViewMode | null) => {
    if (next === null) return
    const clientViewZustand = useClientViewZustand.getState()
    clientViewZustand.setView(next)
  }, [])

  const prefix = rail ? 'client-rail-view' : 'client-view'
  // On the rail each is a square as large as a client's badge below it, so
  // the two read as two buttons rather than one bar.
  const buttonSx = rail ? { width: 32, height: 32, p: 0 } : { flex: 1, gap: 0.75 }

  return (
    <ToggleButtonGroup
      exclusive
      color="primary"
      size="small"
      orientation={rail ? 'vertical' : 'horizontal'}
      value={view}
      onChange={handleChange}
      aria-label="View"
      sx={{ flexShrink: 0, ...(rail ? {} : { width: '100%' }) }}
    >
      <ToggleButton
        value="debug"
        data-testid={`${prefix}-debug-btn`}
        aria-label="Debug"
        title="Debug: configure and write one unit at a time"
        sx={buttonSx}
      >
        <WebAsset fontSize="small" />
        {!rail && 'Debug'}
      </ToggleButton>
      <ToggleButton
        value="monitor"
        data-testid={`${prefix}-monitor-btn`}
        aria-label="Monitor"
        title="Monitor: the read configuration of every unit in one grid"
        sx={buttonSx}
      >
        <TableRows fontSize="small" />
        {!rail && 'Monitor'}
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

export default ViewSwitch

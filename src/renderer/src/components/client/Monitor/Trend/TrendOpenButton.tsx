import ShowChart from '@mui/icons-material/ShowChart'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useCallback } from 'react'
import { useTrendPanelZustand } from './trendPanel.zustand'

/**
 * Monitor's Trend: opens the trend of the client on screen as it was left,
 * or empty, and closes it again. It counts the registers the trend draws.
 * The trend opens in the corner of Monitor's grid room, clear of the
 * toolbar, so the button stays in reach.
 */
const TrendOpenButton = meme((): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const open = useTrendPanelZustand((z) => z.anchor !== null)
  const count = useTrendPanelZustand((z) => (z.uuid === uuid ? z.entries.length : 0))

  const handleClick = useCallback(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    if (open) {
      trendPanelZustand.close()
      return
    }
    trendPanelZustand.open(uuid)
    trendPanelZustand.prune(useClientZustand.getState().clients[uuid]?.units ?? [])
  }, [open, uuid])

  return (
    <Button
      size="small"
      variant="outlined"
      color="inherit"
      data-testid="monitor-trend-btn"
      aria-pressed={open}
      startIcon={<ShowChart sx={{ color: 'success.main' }} />}
      onClick={handleClick}
      sx={{ textTransform: 'none', gap: 0.25 }}
    >
      Trend
      {count > 0 && (
        <Box
          component="span"
          data-testid="monitor-trend-count"
          sx={{
            ml: 0.75,
            px: 0.75,
            borderRadius: '8px',
            fontSize: 11,
            fontFamily: 'monospace',
            bgcolor: 'action.selected'
          }}
        >
          {count}
        </Box>
      )}
    </Button>
  )
})

export default TrendOpenButton

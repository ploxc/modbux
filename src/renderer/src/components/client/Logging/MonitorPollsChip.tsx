import ShowChart from '@mui/icons-material/ShowChart'
import Box from '@mui/material/Box'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'

/** In Debug's section head while the client logs: Monitor polls it, and Debug shows its reads. */
const MonitorPollsChip = meme(
  (): JSX.Element => (
    <Box
      component="span"
      data-testid="debug-monitor-polls"
      title="Monitor polls this client while it logs; Debug shows what Monitor reads"
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        height: 24,
        px: 1.25,
        flexShrink: 0,
        borderRadius: '12px',
        fontSize: 12,
        whiteSpace: 'nowrap',
        color: theme.palette.success.light,
        background: alpha(theme.palette.success.main, 0.14)
      })}
    >
      <ShowChart sx={{ fontSize: 14, color: 'success.main' }} />
      Monitor polls while logging
    </Box>
  )
)

export default MonitorPollsChip

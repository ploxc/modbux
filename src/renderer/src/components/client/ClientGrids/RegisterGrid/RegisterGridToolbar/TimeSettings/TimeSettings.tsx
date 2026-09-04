import Timer from '@mui/icons-material/Timer'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Popover from '@mui/material/Popover'
import { meme } from '@renderer/components/shared/inputs/meme'
import SliderComponent from '@renderer/components/shared/SliderComponent'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useCallback, useState } from 'react'

// Polling interval slider
const PollRate = meme((): JSX.Element => {
  const value = useClientZustand((z) => Math.floor(z.registerConfig.pollRate / 1000))

  const handleChange = useCallback((seconds: number): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setPollRate(seconds * 1000)
  }, [])

  return (
    <SliderComponent
      testId="poll-rate-slider"
      label="Poll Rate"
      value={value}
      setValue={handleChange}
    />
  )
})

// Read Timeout slider
const Timeout = meme((): JSX.Element => {
  const value = useClientZustand((z) => Math.floor(z.registerConfig.timeout / 1000))

  const handleChange = useCallback((seconds: number): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setTimeout(seconds * 1000)
  }, [])

  return (
    <SliderComponent
      testId="timeout-slider"
      label="Timeout"
      value={value}
      setValue={handleChange}
    />
  )
})

const TimeSettings = meme(() => {
  const polling = useClientZustand((z) => z.clientState.polling)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const handleOpenMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>): void => {
      setAnchorEl(anchorEl ? null : event.currentTarget)
    },
    [anchorEl]
  )
  return (
    <Box sx={{ display: 'flex' }}>
      <IconButton
        data-testid="time-settings-btn"
        aria-label="Time settings"
        title="Time settings"
        disabled={polling}
        size="small"
        color="primary"
        onClick={handleOpenMenu}
      >
        <Timer />
      </IconButton>
      <Popover
        data-testid="time-settings-popover"
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorEl={anchorEl}
        disablePortal={false}
      >
        <Paper elevation={3} sx={{ p: 1 }}>
          <PollRate />
          <Timeout />
        </Paper>
      </Popover>
    </Box>
  )
})
export default TimeSettings

import { Timer } from '@mui/icons-material'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Popover from '@mui/material/Popover'
import SliderComponent from '@renderer/components/shared/SliderComponent'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useState } from 'react'

// Polling interval slider
const PollRate = () => {
  const value = useRootZustand((z) => Math.floor(z.registerConfig.pollRate / 1000))
  const setValue = useRootZustand((z) => z.setPollRate)

  return <SliderComponent label="Poll Rate" value={value} setValue={(v) => setValue(v * 1000)} />
}

// Read Timeout slider
const Timeout = () => {
  const value = useRootZustand((z) => Math.floor(z.registerConfig.timeout / 1000))
  const setValue = useRootZustand((z) => z.setTimeout)

  return <SliderComponent label="Timeout" value={value} setValue={(v) => setValue(v * 1000)} />
}

const TimeSettings = () => {
  const polling = useRootZustand((z) => z.clientState.polling)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(anchorEl ? null : event.currentTarget)
  }
  return (
    <Box sx={{ display: 'flex' }}>
      <IconButton disabled={polling} size="small" color="primary" onClick={handleOpenMenu}>
        <Timer />
      </IconButton>
      <Popover
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
}
export default TimeSettings

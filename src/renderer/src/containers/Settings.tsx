import Box from '@mui/material/Box'
import Fade from '@mui/material/Fade'
import { meme } from '@renderer/components/shared/inputs/meme'
import HomeButton from '@renderer/components/shared/HomeButton'
import McpSettings from '@renderer/components/settings/McpSettings'

const Settings = meme(() => (
  <Fade in={true} timeout={500}>
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      <Box>
        <HomeButton />
      </Box>
      <McpSettings />
    </Box>
  </Fade>
))
export default Settings

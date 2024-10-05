import { Fade, Box } from '@mui/material'
import { meme } from '@renderer/components/meme'
import { MessageReceiver, HomeButton } from '../Home/Home'
import ServerGrid from '../ServerGrid/ServerGrid'
import ServerConfig from './ServerConfig/ServerConfig'
import OpenSaveClear from './OpenSaveClear/OpenSaveClear'

const Server = meme(() => {
  return (
    <Fade in={true} timeout={500}>
      <Box
        sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          width: '100%',
          height: '100%',
          minHeight: 0
        }}
      >
        <MessageReceiver />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ display: 'flex', width: '100%', gap: 2, flexWrap: 'wrap' }}>
            <HomeButton />
            <OpenSaveClear />
            <ServerConfig />
          </Box>
        </Box>
        <ServerGrid />
      </Box>
    </Fade>
  )
})
export default Server

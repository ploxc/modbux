import { meme } from '@renderer/components/shared/inputs/meme'
import HomeButton from '@renderer/components/shared/HomeButton'
import MessageReceiver from '@renderer/components/shared/MessageReceiver'
import { useServerZustand } from '@renderer/context/server.zustand'
import OpenSaveClear from '../components/server/OpenSaveClear/OpenSaveClear'
import ServerConfig from '../components/server/ServerConfig/ServerConfig'
import SelectServer from '@renderer/components/server/SelectServer/SelectServer'
import TextField from '@mui/material/TextField'
import Fade from '@mui/material/Fade'
import Box from '@mui/material/Box'
import ServerGrid from '@renderer/components/server/ServerGrid/ServerGrid'

const ServerName = meme(() => {
  const name = useServerZustand((z) => z.name[z.selectedUuid] || '')
  return (
    <TextField
      sx={{ flex: 1, minWidth: 200 }}
      size="small"
      // variant="filled"
      color="primary"
      placeholder="Server Name"
      value={name}
      onChange={(e) => useServerZustand.getState().setName(e.target.value)}
    />
  )
})

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
          <Box
            sx={{ display: 'flex', width: '100%', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
          >
            <HomeButton />
            <OpenSaveClear />
            <SelectServer />
            <ServerName />
            <ServerConfig />
          </Box>
        </Box>
        <ServerGrid />
      </Box>
    </Fade>
  )
})
export default Server

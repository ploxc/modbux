import { meme } from '@renderer/components/shared/inputs/meme'
import Box from '@mui/material/Box'
import Fade from '@mui/material/Fade'
import MessageReceiver from '@renderer/components/shared/MessageReceiver'
import HomeButton from '@renderer/components/shared/HomeButton'
import RegisterConfig from '../components/client/RegisterConfig/RegisterConfig'
import ClientGrids from '@renderer/components/client/ClientGrids/ClientGrids'
import ConnectionConfig from '@renderer/components/client/ConnectionConfig/ConnectionConfig'
import ScanRegisters from '@renderer/components/client/ClientGrids/RegisterGrid/RegisterGridToolbar/MenuButton/ScanRegistersButton/ScanRegisters/ScanRegisters'

const Client = meme(() => {
  return (
    <Fade in={true} timeout={500}>
      <Box
        sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          width: '100%',
          height: '100%'
        }}
      >
        <MessageReceiver />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ display: 'flex', width: '100%', gap: 2, flexWrap: 'wrap' }}>
            <HomeButton />
            <RegisterConfig />
            <ConnectionConfig />
          </Box>
        </Box>
        <ClientGrids />
        <ScanRegisters />
      </Box>
    </Fade>
  )
})
export default Client

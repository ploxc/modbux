import { Fade, Box } from '@mui/material'
import { meme } from '@renderer/components/meme'
import ConnectionConfig from '../ConnectionConfig/ConnectionConfig'
import RegisterConfig from '../RegisterConfig/RegisterConfig'
import ScanRegisters from '../ScanRegisters/ScanRegisters'
import { HomeButton } from '../Home/Home'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import RegisterGrid from '../RegisterGrid/RegisterGrid'
import TransactionGrid from '../TransactionGrid/TransactionGrid'
import MessageReceiver from '../MessageReceiver/MessageReceiver'

const ClientGrids = () => {
  const showLog = useLayoutZustand((z) => z.showLog)
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)

  return scanning ? null : (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        gap: 2
      }}
    >
      <RegisterGrid />
      {showLog && <TransactionGrid />}
    </Box>
  )
}

//
//
//
//
// Modbus client application
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

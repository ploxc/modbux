import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from './context/layout.zustand'
import Home from './containers/Home'
import Client from './containers/Client'
import Server from './containers/Server'
import UpdateBanner from './components/UpdateBanner'

const App = meme((): JSX.Element => {
  const appType = useLayoutZustand((z) => z.appType)

  return (
    <Box
      sx={{
        height: '100dvh',
        width: '100dvw',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <UpdateBanner />
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {appType === 'client' ? <Client /> : appType === 'server' ? <Server /> : <Home />}
      </Box>
    </Box>
  )
})

export default App

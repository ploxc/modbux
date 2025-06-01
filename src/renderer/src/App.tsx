import { Box } from '@mui/material'
import { useLayoutZustand } from './context/layout.zustand'
import Home from './containers/Home'
import Client from './containers/Client'
import Server from './containers/Server'

const App = (): JSX.Element => {
  const appType = useLayoutZustand((z) => z.appType)

  return (
    <Box
      sx={{
        height: '100dvh',
        width: '100dvw',
        overflow: 'hidden'
      }}
    >
      {appType === 'client' ? <Client /> : appType === 'server' ? <Server /> : <Home />}
    </Box>
  )
}

export default App

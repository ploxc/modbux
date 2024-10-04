import { Box } from '@mui/material'
import { useLayoutZustand } from './context/layout.zustand'
import { AppType } from './context/layout.zustand.types'
import Client from './containers/Client/Client'
import Server from './containers/Server/Server'
import Home from './containers/Home/Home'

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
      {appType === AppType.Client ? <Client /> : appType === AppType.Server ? <Server /> : <Home />}
    </Box>
  )
}

export default App

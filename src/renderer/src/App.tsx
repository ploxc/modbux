import { Box, Button, Fade, Typography } from '@mui/material'
import RegisterConfig from './containers/RegisterConfig/RegisterConfig'
import ConnectionConfig from './containers/ConnectionConfig/ConnectionConfig'
import RegisterGrid from './containers/RegisterGrid/RegisterGrid'
import { useSnackbar } from 'notistack'
import { useEffect } from 'react'
import { BackendMessage, ConnectState, IpcEvent } from '@shared'
import TransactionGrid from './containers/TransactionGrid/TransactionGrid'
import { useLayoutZustand } from './context/layout.zustand'
import { useRootZustand } from './context/root.zustand'
import ScanRegisters from './containers/ScanRegisters/ScanRegisters'
import Server from './svg/Server'
import Client from './svg/Client'
import modbusImage from '../../../resources/icon.png'
import { AppType } from './context/layout.zustand.types'
import { CallSplit, Home as HomeIcon } from '@mui/icons-material'
import ServerGrid from './containers/ServerGrid/ServerGrid'
import { IpcRendererEvent } from 'electron'
import { meme } from './components/meme'

const MessageReceiver = () => {
  const { enqueueSnackbar } = useSnackbar()

  const handleMessage = (_: IpcRendererEvent, message: BackendMessage) => {
    enqueueSnackbar({ message: message.message, variant: message.variant })
    if (message.error) console.error(message.error)
  }

  useEffect(() => {
    const unlisten = window.electron.ipcRenderer.on(IpcEvent.BackendMessage, handleMessage)
    return () => unlisten()
  }, [])

  return null
}

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
// Button to open the modbus client
const ClientButton = () => {
  const setAppType = useLayoutZustand((z) => z.setAppType)
  const connected = useRootZustand((z) => z.clientState.connectState === ConnectState.Connected)
  return (
    <Button
      variant="contained"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 160,
        height: 160,
        position: 'relative'
      }}
      onClick={() => setAppType(AppType.Client)}
    >
      {connected && (
        <Box
          sx={(theme) => ({
            position: 'absolute',
            width: 10,
            height: 10,
            top: 8,
            right: 8,
            backgroundColor: theme.palette.warning.main,
            borderRadius: 8
          })}
        />
      )}
      <Client sx={(theme) => ({ fill: theme.palette.background.default })} />
      <Typography variant="overline" sx={(theme) => ({ color: theme.palette.background.default })}>
        Client
      </Typography>
    </Button>
  )
}

//
//
//
//
// Button to open the modbus server configurator
const ServerButton = () => {
  const setAppType = useLayoutZustand((z) => z.setAppType)
  return (
    <Button
      variant="contained"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 160,
        height: 160
      }}
      onClick={() => setAppType(AppType.Server)}
    >
      <Server sx={(theme) => ({ fill: theme.palette.background.default })} />
      <Typography variant="overline" sx={(theme) => ({ color: theme.palette.background.default })}>
        Server
      </Typography>
    </Button>
  )
}

//
//
//
//
// Home screen with modbus server and client buttons
const Home = meme(() => {
  // In your main component file

  return (
    <Fade in={true} timeout={500}>
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <Box
          sx={() => ({
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            left: 0,
            backgroundImage: `url(${modbusImage})`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            opacity: 0.1
          })}
        />
        <Box
          sx={() => ({
            display: 'flex',
            gap: 3
          })}
        >
          <ServerButton />
          <Button
            onClick={() => {
              window.electron.ipcRenderer.send(IpcEvent.OpenServerWindow)
            }}
          >
            <CallSplit sx={theme=>({color: theme.palette.background.default})} fontSize='large'/>
          </Button>
          <ClientButton />
        </Box>
      </Box>
    </Fade>
  )
})

//
//
// Home Button
const HomeButton = () => {
  const setAppType = useLayoutZustand((z) => z.setAppType)
  const hideHomeButton = useLayoutZustand((z) => z.hideHomeButton)

  return hideHomeButton ? null : (
    <Button
      variant="outlined"
      sx={{ minWidth: 38, maxWidth: 38, borderColor: 'rgba(255, 255, 255, 0.23)' }}
      color="info"
      onClick={() => setAppType(undefined)}
    >
      <HomeIcon fontSize="small" />
    </Button>
  )
}

//
//
//
//
// Modbus client application
const ClientApp = meme(() => {
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

//
//
//
//
// Server application
const ServerApp = meme(() => {
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
          </Box>
        </Box>
        <ServerGrid />
      </Box>
    </Fade>
  )
})

//
//
//
//
// MAIN
const App = (): JSX.Element => {
  const appType = useLayoutZustand((z) => z.appType)

  return (
    <Box
      sx={{
        height: '100dvh',
        width: '100dvw'
      }}
    >
      {appType === AppType.Client ? (
        <ClientApp />
      ) : appType === AppType.Server ? (
        <ServerApp />
      ) : (
        <Home />
      )}
    </Box>
  )
}

export default App

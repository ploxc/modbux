import { Box, Button, Fade, Typography } from '@mui/material'
import RegisterConfig from './containers/RegisterConfig/RegisterConfig'
import ConnectionConfig from './containers/ConnectionConfig/ConnectionConfig'
import RegisterGrid from './containers/RegisterGrid/RegisterGrid'
import { useSnackbar } from 'notistack'
import { useEffect } from 'react'
import { BackendMessage, ConnectState, IpcEvent } from '@shared'
import { IpcRendererEvent } from 'electron'
import TransactionGrid from './containers/TransactionGrid/TransactionGrid'
import { useLayoutZustand } from './context/layout.zustand'
import { useRootZustand } from './context/root.zustand'
import ScanRegisters from './containers/ScanRegisters/ScanRegisters'
import Server from './svg/Server'
import Client from './svg/Client'
import modbusImage from '../../../resources/icon.png'
import { AppType } from './context/layout.zustand.types'
import { Home as HomeIcon } from '@mui/icons-material'

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

const Home = () => {
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
          <ClientButton />
        </Box>
      </Box>
    </Fade>
  )
}

const ClientApp = () => {
  const setAppType = useLayoutZustand((z) => z.setAppType)

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
            <Button
              variant="outlined"
              sx={{ minWidth: 38, maxWidth: 38 }}
              color="info"
              onClick={() => setAppType(undefined)}
            >
              <HomeIcon fontSize="small" />
            </Button>
            <RegisterConfig />
            <ConnectionConfig />
          </Box>
        </Box>
        <ClientGrids />
        <ScanRegisters />
      </Box>
    </Fade>
  )
}

const App = (): JSX.Element => {
  const appType = useLayoutZustand((z) => z.appType)
  return (
    <Box
      sx={{
        height: '100dvh',
        width: '100dvw'
      }}
    >
      {appType === AppType.Client ? <ClientApp /> : <Home />}
    </Box>
  )
}

export default App

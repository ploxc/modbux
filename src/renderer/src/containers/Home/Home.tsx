import { CallSplit } from '@mui/icons-material'
import { Fade, Box, Button, Typography } from '@mui/material'
import { meme } from '@renderer/components/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { BackendMessage, ConnectState, IpcEvent } from '@shared'
import { useCallback, useEffect } from 'react'
import modbuxImage from '../../../../../resources/icon.png'
import ClientIcon from '@renderer/svg/Client'
import ServerIcon from '@renderer/svg/Server'
import { useRootZustand } from '@renderer/context/root.zustand'
import { AppType } from '@renderer/context/layout.zustand.types'
import { useServerZustand } from '@renderer/context/server.zustand'
import { Home as HomeIcon } from '@mui/icons-material'
import { useSnackbar } from 'notistack'
import { IpcRendererEvent } from 'electron'

//
//
// Receives message and shows them in a snackbar
export const MessageReceiver = () => {
  const { enqueueSnackbar } = useSnackbar()

  const handleMessage = (_: IpcRendererEvent, message: BackendMessage) => {
    enqueueSnackbar({ message: message.message, variant: message.variant })
    if (message.error) console.error(message.error)
  }

  useEffect(() => {
    // Don't apply the message listener in the server window
    if (window.api.isServerWindow) return
    const unlisten = window.electron.ipcRenderer.on(IpcEvent.BackendMessage, handleMessage)
    return () => unlisten()
  }, [])

  return null
}

//
//
// Home Button
export const HomeButton = () => {
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
      <ClientIcon sx={(theme) => ({ fill: theme.palette.background.default })} />
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
      <ServerIcon sx={(theme) => ({ fill: theme.palette.background.default })} />
      <Typography variant="overline" sx={(theme) => ({ color: theme.palette.background.default })}>
        Server
      </Typography>
    </Button>
  )
}
//
//
// Listens to the shift key
const useShiftKeyListener = () => {
  const setHomeShiftKeyDown = useLayoutZustand((z) => z.setHomeShiftKeyDown)

  const keyDownListener = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Shift') setHomeShiftKeyDown(true)
  }, [])

  const keyUpListener = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Shift') setHomeShiftKeyDown(false)
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', keyDownListener)
    window.addEventListener('keyup', keyUpListener)
    return () => {
      window.removeEventListener('keydown', keyDownListener)
      window.removeEventListener('keyup', keyUpListener)
    }
  }, [])
}

//
//
// Clear storage button
// ! don't know if i will keep it, don't know if it's necessary or will be used
const ClearStorageButton = () => {
  const clearStorage = useCallback(() => {
    useRootZustand.persist.clearStorage()
    useLayoutZustand.persist.clearStorage()
    useServerZustand.persist.clearStorage()
  }, [])

  const shiftKeyDown = useLayoutZustand((z) => z.homeShiftKeyDown)
  return shiftKeyDown ? (
    <Button
      onClick={clearStorage}
      sx={{ position: 'absolute', right: 16, bottom: 16 }}
      variant="outlined"
      size="small"
    >
      Clear Storage
    </Button>
  ) : null
}

const Version = () => {
  const version = useRootZustand((z) => z.version)

  return (
    <Typography
      color="primary"
      fontSize={11}
      fontWeight={'bold'}
      sx={{ position: 'fixed', right: 16, bottom: 12, opacity: 0.8 }}
    >
      {version}
    </Typography>
  )
}

//
//
//
//
// MAIN
const Home = meme(() => {
  useShiftKeyListener()

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
            backgroundImage: `url(${modbuxImage})`,
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
            <CallSplit
              sx={(theme) => ({ color: theme.palette.background.default })}
              fontSize="large"
            />
          </Button>
          <ClientButton />
        </Box>
        <ClearStorageButton />
        <Version />
      </Box>
    </Fade>
  )
})
export default Home

import { CallSplit } from '@mui/icons-material'
import { Fade, Box, Button, Typography } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useCallback, useEffect } from 'react'
import modbuxImage from '../../../../resources/icon.png'
import ClientIcon from '@renderer/svg/Client'
import ServerIcon from '@renderer/svg/Server'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useServerZustand } from '@renderer/context/server.zustand'

//
//
//
// Button to open the modbus client
const ClientButton = meme(() => {
  const setAppType = useLayoutZustand((z) => z.setAppType)
  const connected = useRootZustand((z) => z.clientState.connectState === 'connected')
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
      onClick={() => setAppType('client')}
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
})

//
//
//
//
// Button to open the modbus server configurator
const ServerButton = meme((): JSX.Element => {
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
      onClick={() => setAppType('server')}
    >
      <ServerIcon sx={(theme) => ({ fill: theme.palette.background.default })} />
      <Typography variant="overline" sx={(theme) => ({ color: theme.palette.background.default })}>
        Server
      </Typography>
    </Button>
  )
})

//
//
// Listens to the shift key
const useShiftKeyListener = (): void => {
  const setHomeShiftKeyDown = useLayoutZustand((z) => z.setHomeShiftKeyDown)

  const keyDownListener = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Shift') setHomeShiftKeyDown(true)
    },
    [setHomeShiftKeyDown]
  )

  const keyUpListener = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Shift') setHomeShiftKeyDown(false)
    },
    [setHomeShiftKeyDown]
  )

  useEffect(() => {
    window.addEventListener('keydown', keyDownListener)
    window.addEventListener('keyup', keyUpListener)
    return (): void => {
      window.removeEventListener('keydown', keyDownListener)
      window.removeEventListener('keyup', keyUpListener)
    }
  }, [keyDownListener, keyUpListener])
}

//
//
// Clear storage button
// ! don't know if i will keep it, don't know if it's necessary or will be used
const ClearStorageButton = meme(() => {
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
})

const Version = meme(() => {
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
})

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
              window.events.send('open_server_window')
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

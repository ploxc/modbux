import { CallSplit } from '@mui/icons-material'
import { Fade, Box, Button, Typography, SxProps } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useCallback, useEffect } from 'react'
import modbuxImage from '../../../../resources/icon.png'
import ClientIcon from '@renderer/svg/Client'
import ServerIcon from '@renderer/svg/Server'
import { useRootZustand } from '@renderer/context/root.zustand'
import { sendEvent } from '@renderer/events'
import Ploxc from '@renderer/svg/Ploxc'
import GithubCat from '@renderer/svg/GithubCat'

//
//
//
// Button to open the modbus client
const ClientButton = meme(() => {
  const setAppType = useLayoutZustand((z) => z.setAppType)
  const connected = useRootZustand((z) => z.clientState.connectState === 'connected')
  return (
    <Button
      data-testid="home-client-btn"
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
      data-testid="home-server-btn"
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

const bottomElementsCommonSx: SxProps = {
  position: 'fixed',
  bottom: 12,
  display: 'flex',
  gap: 1,
  opacity: 0.75,
  textDecoration: 'none',
  '&:hover': { opacity: 1 }
}

const PloxcLogo = (): JSX.Element => {
  return (
    <Box
      data-testid="home-ploxc-link"
      aria-label="Ploxc GitHub"
      component={'a'}
      href="https://github.com/ploxc"
      target="_blank"
      rel="noreferrer"
      sx={{ left: 16, ...bottomElementsCommonSx }}
    >
      <Ploxc sx={{ height: 18 }} />
      <Typography sx={{ fontWeight: 800, color: '#cccccc' }}>Ploxc</Typography>
    </Box>
  )
}

const Version = (): JSX.Element => {
  const version = useRootZustand((z) => z.version)

  return (
    <Box
      data-testid="home-version-link"
      aria-label="Modbux GitHub"
      component={'a'}
      href="https://github.com/ploxc/modbux"
      target="_blank"
      sx={{ right: 16, ...bottomElementsCommonSx }}
    >
      <Typography color="primary" fontSize={14} fontWeight={800}>
        {version}
      </Typography>
      <GithubCat sx={{ width: 16 }} />
    </Box>
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
        <Box sx={() => ({ display: 'flex', gap: 3 })}>
          <ServerButton />
          <Button
            data-testid="home-split-btn"
            aria-label="Open server in separate window"
            title="Open server in separate window"
            onClick={() => {
              sendEvent('open_server_window')
            }}
          >
            <CallSplit
              sx={(theme) => ({ color: theme.palette.background.default })}
              fontSize="large"
            />
          </Button>
          <ClientButton />
        </Box>
        <PloxcLogo />
        <Version />
      </Box>
    </Fade>
  )
})
export default Home

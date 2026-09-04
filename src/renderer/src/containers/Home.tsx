import CallSplit from '@mui/icons-material/CallSplit'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Fade from '@mui/material/Fade'
import Typography from '@mui/material/Typography'
import { SxProps } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useCallback, useEffect } from 'react'
import modbuxImage from '../../../../resources/icon.png'
import ClientIcon from '@renderer/svg/Client'
import ServerIcon from '@renderer/svg/Server'
import { useClientZustand } from '@renderer/context/client.zustand'
import { sendEvent } from '@renderer/events'
import Ploxc from '@renderer/svg/Ploxc'
import GithubCat from '@renderer/svg/GithubCat'

//
//
//
// Button to open the modbus client
const ClientButton = meme(() => {
  const connected = useClientZustand((z) => z.clientState.connectState === 'connected')

  const handleClick = useCallback((): void => {
    const layoutZustand = useLayoutZustand.getState()
    layoutZustand.setAppType('client')
  }, [])

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
      onClick={handleClick}
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
  const handleClick = useCallback((): void => {
    const layoutZustand = useLayoutZustand.getState()
    layoutZustand.setAppType('server')
  }, [])

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
      onClick={handleClick}
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
  const keyDownListener = useCallback((event: KeyboardEvent): void => {
    const layoutZustand = useLayoutZustand.getState()
    if (event.key === 'Shift') layoutZustand.setHomeShiftKeyDown(true)
  }, [])

  const keyUpListener = useCallback((event: KeyboardEvent): void => {
    const layoutZustand = useLayoutZustand.getState()
    if (event.key === 'Shift') layoutZustand.setHomeShiftKeyDown(false)
  }, [])

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

const PloxcLogo = meme((): JSX.Element => {
  return (
    <Box
      data-testid="home-ploxc-link"
      aria-label="Ploxc"
      component={'a'}
      href="https://ploxc.com"
      target="_blank"
      rel="noreferrer"
      sx={{ left: 16, ...bottomElementsCommonSx }}
    >
      <Ploxc sx={{ height: 18 }} />
      <Typography sx={(theme) => ({ fontWeight: 800, color: theme.palette.info.main })}>
        Ploxc
      </Typography>
    </Box>
  )
})

const Version = meme((): JSX.Element => {
  const version = useLayoutZustand((z) => z.version)

  return (
    <Box
      data-testid="home-version-link"
      aria-label="Modbux GitHub"
      component={'a'}
      href="https://github.com/ploxc/modbux"
      target="_blank"
      sx={{ right: 16, ...bottomElementsCommonSx }}
    >
      <Typography color="primary" sx={{ fontSize: 14, fontWeight: 800 }}>
        {version}
      </Typography>
      <GithubCat sx={{ width: 16 }} />
    </Box>
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

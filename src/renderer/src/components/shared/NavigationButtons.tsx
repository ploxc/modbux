import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import Home from '@mui/icons-material/Home'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { AppType } from '@renderer/context/layout.zustand.types'
import ClientIcon from '@renderer/svg/Client'
import ServerIcon from '@renderer/svg/Server'
import { useCallback } from 'react'

const ICON_SX = { width: 20, height: 20, fill: 'currentColor' }

const OTHER_SIDE = {
  client: { label: 'Go to the client', icon: <ClientIcon sx={ICON_SX} /> },
  server: { label: 'Go to the server', icon: <ServerIcon sx={ICON_SX} /> }
}

/**
 * Home, and the other side of the app in this window, as one group. Hidden
 * where Home is: in the server's own window, and in the main window while it
 * is open.
 */
const NavigationButtons = meme(({ other }: { other: AppType }): JSX.Element | null => {
  const hideHomeButton = useLayoutZustand((z) => z.hideHomeButton)

  const handleHome = useCallback((): void => {
    const layoutZustand = useLayoutZustand.getState()
    layoutZustand.setAppType(undefined)
  }, [])
  const handleOther = useCallback((): void => {
    const layoutZustand = useLayoutZustand.getState()
    layoutZustand.setAppType(other)
  }, [other])

  const { label, icon } = OTHER_SIDE[other]
  return hideHomeButton ? null : (
    <ButtonGroup
      variant="outlined"
      size="large"
      color="info"
      sx={{ '& .MuiButtonGroup-grouped': { borderColor: 'divider' } }}
    >
      <Button
        data-testid="home-btn"
        aria-label="Return to home"
        title="Return to home"
        onClick={handleHome}
      >
        <Home fontSize="small" />
      </Button>
      <Button
        data-testid={`nav-${other}-btn`}
        aria-label={label}
        title={label}
        onClick={handleOther}
      >
        {icon}
      </Button>
    </ButtonGroup>
  )
})

export default NavigationButtons

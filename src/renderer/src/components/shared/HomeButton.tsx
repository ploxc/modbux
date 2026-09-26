import Button from '@mui/material/Button'
import Home from '@mui/icons-material/Home'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useCallback } from 'react'

const HomeButton = meme((): JSX.Element | null => {
  const hideHomeButton = useLayoutZustand((z) => z.hideHomeButton)

  const handleClick = useCallback((): void => {
    const layoutZustand = useLayoutZustand.getState()
    layoutZustand.setAppType(undefined)
  }, [])

  return hideHomeButton ? null : (
    <Button
      data-testid="home-btn"
      aria-label="Return to home"
      title="Return to home"
      variant="outlined"
      size="large"
      sx={{ borderColor: 'divider' }}
      color="info"
      onClick={handleClick}
    >
      <Home fontSize="small" />
    </Button>
  )
})

export default HomeButton

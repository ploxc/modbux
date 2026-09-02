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
      sx={{ minWidth: 38, maxWidth: 38, height: 36, borderColor: 'rgba(255, 255, 255, 0.23)' }}
      color="info"
      onClick={handleClick}
    >
      <Home fontSize="small" />
    </Button>
  )
})

export default HomeButton

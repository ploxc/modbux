import Button from '@mui/material/Button'
import { Home } from '@mui/icons-material'
import { useLayoutZustand } from '@renderer/context/layout.zustand'

const HomeButton = (): JSX.Element | null => {
  const setAppType = useLayoutZustand((z) => z.setAppType)
  const hideHomeButton = useLayoutZustand((z) => z.hideHomeButton)

  return hideHomeButton ? null : (
    <Button
      variant="outlined"
      sx={{ minWidth: 38, maxWidth: 38, height: 36, borderColor: 'rgba(255, 255, 255, 0.23)' }}
      color="info"
      onClick={() => setAppType(undefined)}
    >
      <Home fontSize="small" />
    </Button>
  )
}

export default HomeButton

import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useCallback } from 'react'

const ShowLogButton = meme((): JSX.Element => {
  const showLog = useLayoutZustand((z) => z.showLog)

  const handleClick = useCallback((): void => {
    const layoutZustand = useLayoutZustand.getState()
    layoutZustand.toggleShowLog()
  }, [])

  const variant: ButtonProps['variant'] = showLog ? 'contained' : 'outlined'
  const text = showLog ? 'Hide Log' : 'Show Log'

  return (
    <Button data-testid="show-log-btn" size="small" variant={variant} onClick={handleClick}>
      {text}
    </Button>
  )
})

export default ShowLogButton

import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useCallback } from 'react'

const ReadButton = meme((): JSX.Element => {
  const connected = useClientZustand((z) => z.clientState.connectState === 'connected')
  const polling = useClientZustand((z) => z.clientState.polling)

  // Main says a read is running, and refuses a second one while it is. This
  // used to be a ref here, which held for this button and for nothing else.
  const reading = useClientZustand((z) => z.clientState.reading)

  const handleRead = useCallback(() => {
    window.api.read()
  }, [])

  const color: ButtonProps['color'] = reading ? 'warning' : 'primary'
  const disabled = !connected || polling || reading

  return (
    <Button
      data-testid="read-btn"
      disabled={disabled}
      color={color}
      size="small"
      variant="outlined"
      onClick={handleRead}
    >
      Read
    </Button>
  )
})

export default ReadButton

import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useCallback } from 'react'

const PollButton = meme((): JSX.Element => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'connected')

  const polling = useClientZustand((z) => z.clientState.polling)
  const togglePolling = useCallback(() => {
    polling ? window.api.stopPolling() : window.api.startPolling()
  }, [polling])

  const variant: ButtonProps['variant'] = polling ? 'contained' : 'outlined'
  const color: ButtonProps['color'] = polling ? 'warning' : 'primary'

  return (
    <Button
      data-testid="poll-btn"
      disabled={disabled}
      size="small"
      color={color}
      variant={variant}
      onClick={togglePolling}
    >
      Poll
    </Button>
  )
})

export default PollButton

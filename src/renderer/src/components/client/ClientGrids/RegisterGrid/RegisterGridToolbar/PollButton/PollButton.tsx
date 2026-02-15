import Button, { ButtonProps } from '@mui/material/Button'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useCallback } from 'react'

const PollButton = (): JSX.Element => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'connected')

  const polling = useRootZustand((z) => z.clientState.polling)
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
}

export default PollButton

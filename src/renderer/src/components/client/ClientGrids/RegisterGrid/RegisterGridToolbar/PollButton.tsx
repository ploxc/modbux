import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { clientOwner } from '@shared'
import { useCallback } from 'react'

const PollButton = meme((): JSX.Element => {
  const notConnected = useClientZustand((z) => z.clientState.connectState !== 'connected')

  // What main would refuse a start for. `exceptPolling` is what keeps the
  // press that stops one: during a poll nothing else can own the client, so
  // this is undefined and the button is the Stop button.
  const owner = useClientZustand((z) => clientOwner(z.clientState, { exceptPolling: true }))
  const disabled = notConnected || owner !== undefined

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

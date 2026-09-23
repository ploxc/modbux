import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand } from '@renderer/context/data.zustand'
import { clientOwner } from '@shared'
import { useCallback } from 'react'
import { selectedClientUuid } from '@renderer/context/client.zustand'

const PollButton = meme((): JSX.Element => {
  const notConnected = useDataZustand((z) => z.clientState.connectState !== 'connected')

  // What main would refuse a start for. `exceptPolling` is what keeps the
  // press that stops one: during a poll nothing else can own the client, so
  // this is undefined and the button is the Stop button.
  const owner = useDataZustand((z) => clientOwner(z.clientState, { exceptPolling: true }))
  const disabled = notConnected || owner !== undefined

  const polling = useDataZustand((z) => z.clientState.polling)
  const togglePolling = useCallback(() => {
    const uuid = selectedClientUuid()
    polling ? window.api.stopPolling(uuid) : window.api.startPolling(uuid)
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

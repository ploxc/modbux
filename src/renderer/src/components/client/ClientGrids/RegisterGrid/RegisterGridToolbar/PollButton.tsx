import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand, dataOf } from '@renderer/context/data.zustand'
import { clientOwner } from '@shared'
import { useCallback } from 'react'
import { selectedClientUuid, useClientZustand } from '@renderer/context/client.zustand'

const PollButton = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const notConnected = useDataZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'connected'
  )

  // What main would refuse a start for. `exceptPolling` is what keeps the
  // press that stops one: during a poll nothing else can own the client, so
  // this is undefined and the button is the Stop button.
  const owner = useDataZustand((z) =>
    clientOwner(dataOf(z, selectedUuid).clientState, { exceptPolling: true })
  )
  const polling = useDataZustand((z) => dataOf(z, selectedUuid).clientState.polling)
  // A poll goes on through a reconnect, so the press that stops it does too.
  const disabled = (notConnected && !polling) || owner !== undefined

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

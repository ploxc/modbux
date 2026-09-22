import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand } from '@renderer/context/data.zustand'
import { clientOwner } from '@shared'
import { useCallback } from 'react'

const ReadButton = meme((): JSX.Element => {
  const connected = useDataZustand((z) => z.clientState.connectState === 'connected')

  // What main would refuse this press for, which is the same question it asks
  // of every caller that puts a request on the wire. Naming a subset of it
  // left the button pressable during both scans, where it was reachable only
  // by what the two dialogs happen to draw over.
  const owner = useDataZustand((z) => clientOwner(z.clientState))

  // A read in flight is the one state this says something about rather than
  // just refusing.
  const reading = useDataZustand((z) => z.clientState.reading)

  const handleRead = useCallback(() => {
    window.api.read()
  }, [])

  const color: ButtonProps['color'] = reading ? 'warning' : 'primary'
  const disabled = !connected || owner !== undefined

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

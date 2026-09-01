import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useCallback, useRef, useState } from 'react'

const ReadButton = meme((): JSX.Element => {
  const disabled = useRootZustand(
    (z) => z.clientState.connectState !== 'connected' || z.clientState.polling
  )

  const [reading, setReading] = useState(false)
  const readingRef = useRef(false)

  // Read registers, prevent sending the command until the read is done
  const handleRead = useCallback(async () => {
    if (readingRef.current) return
    readingRef.current = true
    setReading(true)
    await window.api.read()
    readingRef.current = false
    setReading(false)
  }, [])

  const color: ButtonProps['color'] = reading ? 'warning' : 'primary'

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

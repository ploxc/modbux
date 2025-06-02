import { onEvent } from '@renderer/events'
import { BackendMessage } from '@shared'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect } from 'react'

// Receives message and shows them in a snackbar
const MessageReceiver = (): null => {
  const { enqueueSnackbar } = useSnackbar()

  const handleMessage = useCallback(
    (message: BackendMessage) => {
      enqueueSnackbar({ message: message.message, variant: message.variant })
      if (message.error) console.error(message.error)
    },
    [enqueueSnackbar]
  )

  useEffect(() => {
    // Don't apply the message listener in the server window
    if (window.api.isServerWindow) return
    const unlisten = onEvent('backend_message', handleMessage)
    return (): void => unlisten()
  }, [handleMessage])

  return null
}
export default MessageReceiver

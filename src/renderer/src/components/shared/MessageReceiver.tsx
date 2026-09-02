import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useServerZustand } from '@renderer/context/server.zustand'
import { onEvent } from '@renderer/events'
import { BackendMessage } from '@shared'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect } from 'react'

// Receives message and shows them in a snackbar
const MessageReceiver = meme((): null => {
  const { enqueueSnackbar } = useSnackbar()
  const clientConfigWasReset = useClientZustand((z) => z.configWasReset)
  const serverConfigWasReset = useServerZustand((z) => z.configWasReset)
  const acknowledgeClientReset = useClientZustand((z) => z.acknowledgeConfigReset)
  const acknowledgeServerReset = useServerZustand((z) => z.acknowledgeConfigReset)

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

  // A store whose persisted config failed its schema resets itself while the
  // module graph is still evaluating, which is before any provider exists to
  // tell. It records the reset instead, and this says so. Both windows report
  // their own: the server window runs the server store and no message listener.
  //
  // Acknowledged after telling, because this component mounts inside Client and
  // Server rather than at the root: without that, walking Home and back reports
  // the same reset again.
  useEffect(() => {
    if (clientConfigWasReset) {
      enqueueSnackbar({
        variant: 'error',
        message: 'Client configuration was corrupted and has been reset to defaults.'
      })
      acknowledgeClientReset()
    }
    if (serverConfigWasReset) {
      enqueueSnackbar({
        variant: 'error',
        message: 'Server configuration was corrupted and has been reset to defaults.'
      })
      acknowledgeServerReset()
    }
  }, [
    clientConfigWasReset,
    serverConfigWasReset,
    acknowledgeClientReset,
    acknowledgeServerReset,
    enqueueSnackbar
  ])

  return null
})
export default MessageReceiver

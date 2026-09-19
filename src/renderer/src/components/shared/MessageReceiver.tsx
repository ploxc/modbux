import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useServerZustand } from '@renderer/context/server.zustand'
import { onEvent } from '@renderer/events'
import { BackendMessage, resetMessage } from '@shared'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect } from 'react'

// Receives message and shows them in a snackbar
const MessageReceiver = meme((): null => {
  const { enqueueSnackbar } = useSnackbar()
  const clientConfigReset = useClientZustand((z) => z.configReset)
  const serverConfigReset = useServerZustand((z) => z.configReset)

  const handleMessage = useCallback(
    (message: BackendMessage) => {
      enqueueSnackbar({ message: message.message, variant: message.variant })
      if (message.error) console.error(message.error)
    },
    [enqueueSnackbar]
  )

  // Both windows listen. The server window returned here instead, so in split
  // view a payload refused on a channel it owns reported into the window the
  // user was not looking at, and the port field snapped back with nothing said.
  // A refusal now goes to the window that asked, so listening in both costs no
  // duplicate snackbar.
  useEffect(() => {
    const unlisten = onEvent('backend_message', handleMessage)
    return (): void => unlisten()
  }, [handleMessage])

  // A store repairs its persisted config while the module graph is still
  // evaluating, which is before any provider exists to tell. It records what it
  // had to reset instead, and this says so. Both windows report their own,
  // because each holds its own copy of both stores.
  //
  // Acknowledged after telling, because this component mounts inside Client and
  // Server rather than at the root: without that, walking Home and back reports
  // the same reset again.
  useEffect(() => {
    const clientZustand = useClientZustand.getState()
    const serverZustand = useServerZustand.getState()
    if (clientConfigReset !== undefined) {
      enqueueSnackbar({ variant: 'error', message: resetMessage('Client', clientConfigReset) })
      clientZustand.acknowledgeConfigReset()
    }
    if (serverConfigReset !== undefined) {
      enqueueSnackbar({ variant: 'error', message: resetMessage('Server', serverConfigReset) })
      serverZustand.acknowledgeConfigReset()
    }
  }, [clientConfigReset, serverConfigReset, enqueueSnackbar])

  return null
})
export default MessageReceiver

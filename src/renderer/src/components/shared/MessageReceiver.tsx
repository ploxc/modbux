import { BackendMessage, IpcEvent } from '@shared'
import { IpcRendererEvent } from 'electron'
import { useSnackbar } from 'notistack'
import { useEffect } from 'react'

// Receives message and shows them in a snackbar
const MessageReceiver = () => {
  const { enqueueSnackbar } = useSnackbar()

  const handleMessage = (_: IpcRendererEvent, message: BackendMessage) => {
    enqueueSnackbar({ message: message.message, variant: message.variant })
    if (message.error) console.error(message.error)
  }

  useEffect(() => {
    // Don't apply the message listener in the server window
    if (window.api.isServerWindow) return
    const unlisten = window.electron.ipcRenderer.on(IpcEvent.BackendMessage, handleMessage)
    return () => unlisten()
  }, [])

  return null
}
export default MessageReceiver

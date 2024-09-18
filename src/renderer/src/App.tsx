import { Box, Fade } from '@mui/material'
import RegisterConfig from './containers/RegisterConfig/RegisterConfig'
import ConnectionConfig from './containers/ConnectionConfig/ConnectionConfig'
import RegisterGrid from './containers/RegisterGrid/RegisterGrid'
import { useSnackbar } from 'notistack'
import { useEffect } from 'react'
import { BackendMessage, IpcEvent } from '@shared'
import { IpcRendererEvent } from 'electron'
import TransactionGrid from './containers/TransactionGrid/TransactionGrid'
import { useLayoutZustand } from './context/layout.zustand'

const MessageReceiver = () => {
  const { enqueueSnackbar } = useSnackbar()

  const handleMessage = (_: IpcRendererEvent, message: BackendMessage) => {
    enqueueSnackbar({ message: message.message, variant: message.variant })
    if (message.error) console.error(message.error)
  }

  useEffect(() => {
    const unlisten = window.electron.ipcRenderer.on(IpcEvent.BackendMessage, handleMessage)
    return () => unlisten()
  }, [])

  return null
}

const Grids = () => {
  const showLog = useLayoutZustand((z) => z.showLog)

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        gap: 2
      }}
    >
      <RegisterGrid />
      {showLog && <TransactionGrid />}
    </Box>
  )
}

const App = (): JSX.Element => {
  return (
    <Fade in={true} timeout={500}>
      <Box
        sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          height: '100dvh',
          width: '100dvw'
        }}
      >
        <MessageReceiver />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ display: 'flex', width: '100%', gap: 2, flexWrap: 'wrap' }}>
            <RegisterConfig />
            <ConnectionConfig />
          </Box>
        </Box>
        <Grids />
      </Box>
    </Fade>
  )
}

export default App

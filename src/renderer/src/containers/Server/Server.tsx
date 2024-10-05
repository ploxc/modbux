import { Fade, Box, ToggleButtonGroup, ToggleButton } from '@mui/material'
import { meme } from '@renderer/components/meme'
import { MessageReceiver, HomeButton } from '../Home/Home'
import ServerGrid from '../ServerGrid/ServerGrid'
import ServerConfig from './ServerConfig/ServerConfig'
import { Delete, FileOpen, Save } from '@mui/icons-material'
import { useCallback, useState } from 'react'
import { useServerZustand } from '@renderer/context/server.zustand'
import { RegisterType } from '@shared'

enum Action {
  Save = 'Save',
  Open = 'Open',
  Clear = 'Clear'
}

const OpenSaveClear = () => {
  const [action, setAction] = useState<Action | null>(null)
  const handle = useCallback(
    async (_: any, newAction: Action | null) => {
      setAction(newAction)

      const serverState = useServerZustand.getState()

      switch (newAction) {
        case Action.Open:
          // const file = await window.api.openFile()
          // if (file) serverState.load(file)
          break
        case Action.Save:
          // const data = serverState.save()
          // await window.api.saveFile(data)
          break
        case Action.Clear:
          serverState.resetBools(RegisterType.Coils)
          serverState.resetBools(RegisterType.DiscreteInputs)
          serverState.resetRegisters(RegisterType.HoldingRegisters)
          serverState.resetRegisters(RegisterType.InputRegisters)
          // Only for visual purposes, don't actually takes time
          await new Promise((r) => setTimeout(r, 50))
          break
      }

      setAction(null)
    },
    [setAction]
  )

  return (
    <ToggleButtonGroup size="small" color="primary" exclusive value={action} onChange={handle}>
      <ToggleButton value="Open">
        <FileOpen />
      </ToggleButton>
      <ToggleButton value="Save">
        <Save />
      </ToggleButton>
      <ToggleButton value="Clear">
        <Delete />
      </ToggleButton>
    </ToggleButtonGroup>
  )
}

const Server = meme(() => {
  return (
    <Fade in={true} timeout={500}>
      <Box
        sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          width: '100%',
          height: '100%',
          minHeight: 0
        }}
      >
        <MessageReceiver />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ display: 'flex', width: '100%', gap: 2, flexWrap: 'wrap' }}>
            <HomeButton />
            <OpenSaveClear />
            <ServerConfig />
          </Box>
        </Box>
        <ServerGrid />
      </Box>
    </Fade>
  )
})
export default Server

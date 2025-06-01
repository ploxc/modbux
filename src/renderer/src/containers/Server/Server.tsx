import {
  Fade,
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  ButtonGroup,
  TextField
} from '@mui/material'
import { meme } from '@renderer/components/meme'
import { HomeButton } from '../Home/Home'
import ServerGrid from '../ServerGrid/ServerGrid'
import ServerConfig from './ServerConfig/ServerConfig'
import OpenSaveClear from './OpenSaveClear/OpenSaveClear'
import { useServerZustand } from '@renderer/context/server.zustand'
import MessageReceiver from '../MessageReceiver/MessageReceiver'
import { Add, Delete } from '@mui/icons-material'
import { MAIN_SERVER_UUID } from '@shared'
import { useCallback } from 'react'
import { v4 } from 'uuid'

/**
 * Returns the first available port within the range 502–1000 that is not in the provided list.
 * @param usedPorts Array of ports that are already in use.
 * @returns A free port number or undefined if none available.
 */
const findAvailablePort = (usedPorts: number[]): number | undefined => {
  const MIN_PORT = 502
  const MAX_PORT = 1000

  // Create a Set for fast lookup
  const usedSet = new Set(usedPorts)

  // Start looking from one higher than the max used port (if in range)
  const startPort = Math.max(MIN_PORT, Math.min(MAX_PORT, Math.max(...usedPorts, MIN_PORT - 1) + 1))

  // Search from startPort to MAX_PORT
  for (let port = startPort; port <= MAX_PORT; port++) {
    if (!usedSet.has(port)) return port
  }

  // If nothing found, wrap around and check from MIN_PORT up to startPort - 1
  for (let port = MIN_PORT; port < startPort; port++) {
    if (!usedSet.has(port)) return port
  }

  // All ports taken
  return undefined
}

const SelectServerToggle = meme(({ uuid }: { uuid: string }) => {
  const port = useServerZustand((z) => z.port[uuid])
  return (
    <ToggleButton value={uuid} sx={{ px: 1.5 }}>
      {port}
    </ToggleButton>
  )
})

const SelectServer = meme(() => {
  const serverUuids = useServerZustand((z) => z.uuids)
  const selectedUuid = useServerZustand((z) => z.selectedUuid)
  const addDisabled = useServerZustand((z) => Object.keys(z.uuids).length >= 8)

  const addServer = useCallback(async () => {
    const z = useServerZustand.getState()
    const newPort = findAvailablePort(Object.values(z.port).map((v) => Number(v)))
    if (!newPort) throw new Error('No available port')
    z.createServer({ port: newPort, uuid: v4() }, true)
  }, [])

  const deleteServer = useCallback(() => {
    const z = useServerZustand.getState()
    z.deleteServer(z.selectedUuid)
  }, [])

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <ButtonGroup variant="contained" color="primary" sx={{ height: 36 }}>
        <Button onClick={addServer} disabled={addDisabled}>
          <Add />
        </Button>
        <Button
          onClick={deleteServer}
          variant="outlined"
          disabled={selectedUuid === MAIN_SERVER_UUID}
        >
          <Delete />
        </Button>
      </ButtonGroup>
      <ToggleButtonGroup
        size="small"
        color="primary"
        value={selectedUuid}
        exclusive
        onChange={(_, v) => {
          if (!v) return
          useServerZustand.getState().setSelectedUuid(v)
        }}
      >
        {serverUuids.map((uuid) => (
          <SelectServerToggle key={uuid} uuid={uuid} />
        ))}
      </ToggleButtonGroup>
    </Box>
  )
})

const ServerName = meme(() => {
  const name = useServerZustand((z) => z.name[z.selectedUuid] || '')
  return (
    <TextField
      sx={{ flex: 1, minWidth: 200 }}
      size="small"
      // variant="filled"
      color="primary"
      placeholder="Server Name"
      value={name}
      onChange={(e) => useServerZustand.getState().setName(e.target.value)}
    />
  )
})

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
          <Box
            sx={{ display: 'flex', width: '100%', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
          >
            <HomeButton />
            <OpenSaveClear />
            <SelectServer />
            <ServerName />
            <ServerConfig />
          </Box>
        </Box>
        <ServerGrid />
      </Box>
    </Fade>
  )
})
export default Server

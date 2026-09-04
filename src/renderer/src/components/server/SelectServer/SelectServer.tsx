import Add from '@mui/icons-material/Add'
import Delete from '@mui/icons-material/Delete'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useServerZustand } from '@renderer/context/server.zustand'
import { findAvailablePort, MAIN_SERVER_UUID } from '@shared'
import { useCallback } from 'react'
import { v4 } from 'uuid'
import ButtonGroup from '@mui/material/ButtonGroup'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'

const SelectServerToggle = meme(({ uuid }: { uuid: string }) => {
  const port = useServerZustand((z) => z.port[uuid])
  return (
    <ToggleButton data-testid={`select-server-${port}`} value={uuid} sx={{ px: 1.5 }}>
      {port}
    </ToggleButton>
  )
})

const SelectServer = meme(() => {
  const serverMode = useServerZustand((z) => z.serverMode ?? 'tcp')
  const serverUuids = useServerZustand((z) => z.uuids)
  const selectedUuid = useServerZustand((z) => z.selectedUuid)
  const addDisabled = useServerZustand((z) => Object.keys(z.uuids).length >= 10)

  const addServer = useCallback(async () => {
    const serverZustand = useServerZustand.getState()
    const newPort = findAvailablePort(Object.values(serverZustand.port).map((v) => Number(v)))
    if (!newPort) throw new Error('No available port')
    serverZustand.createServer({ port: newPort, uuid: v4() })
  }, [])

  const deleteServer = useCallback(() => {
    const serverZustand = useServerZustand.getState()
    serverZustand.deleteServer(serverZustand.selectedUuid)
  }, [])

  const handleSelect = useCallback((_event: unknown, value: string | null): void => {
    if (!value) return
    const serverZustand = useServerZustand.getState()
    serverZustand.setSelectedUuid(value)
  }, [])

  if (serverMode === 'rtu') return null

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <ButtonGroup variant="contained" color="primary" sx={{ height: 36 }}>
        <Button
          data-testid="add-server-btn"
          aria-label="Add server"
          title="Add server"
          onClick={addServer}
          disabled={addDisabled}
        >
          <Add />
        </Button>
        <Button
          data-testid="delete-server-btn"
          aria-label="Delete server"
          title="Delete server"
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
        onChange={handleSelect}
      >
        {serverUuids.map((uuid) => (
          <SelectServerToggle key={uuid} uuid={uuid} />
        ))}
      </ToggleButtonGroup>
    </Box>
  )
})

export default SelectServer

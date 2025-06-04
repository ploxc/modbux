import { Add, Delete } from '@mui/icons-material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useServerZustand } from '@renderer/context/server.zustand'
import { MAIN_SERVER_UUID } from '@shared'
import { useCallback } from 'react'
import { v4 } from 'uuid'
import { findAvailablePort } from './findAvailablePort'
import ButtonGroup from '@mui/material/ButtonGroup'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'

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
    z.createServer({ port: newPort, uuid: v4() })
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

export default SelectServer

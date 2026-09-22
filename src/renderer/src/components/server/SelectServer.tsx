import Add from '@mui/icons-material/Add'
import Delete from '@mui/icons-material/Delete'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useServerZustand } from '@renderer/context/server.zustand'
import { findAvailablePort, MAIN_SERVER_UUID } from '@shared'
import { useCallback, useMemo } from 'react'
import { useSnackbar } from 'notistack'
import { v4 } from 'uuid'
import ButtonGroup from '@mui/material/ButtonGroup'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'

const SelectServerToggle = meme(({ uuid }: { uuid: string }) => {
  const port = useServerZustand((z) => z.servers[uuid]?.port)
  return (
    <ToggleButton data-testid={`select-server-${port}`} value={uuid} sx={{ px: 1.5 }}>
      {port}
    </ToggleButton>
  )
})

const SelectServer = meme(() => {
  const serverMode = useServerZustand((z) => z.serverMode ?? 'tcp')
  // A string rather than the array, because zustand compares a selector's
  // answer with `Object.is` and `Object.keys` allocates a new one every time
  // it runs. React reads the selector again on the render that follows, finds
  // another new array and renders again: measured as "Maximum update depth
  // exceeded" with the array here. A uuid carries no space, so this is the
  // same value until a server is added or removed.
  const serverUuidKey = useServerZustand((z) => Object.keys(z.servers).join(' '))
  const serverUuids = useMemo(
    // An empty record is a blob that carries one, which `init` answers by
    // making the main server. `''.split(' ')` is `['']`, a toggle for a uuid
    // nothing holds.
    () => (serverUuidKey === '' ? [] : serverUuidKey.split(' ')),
    [serverUuidKey]
  )
  const selectedUuid = useServerZustand((z) => z.selectedUuid)
  const addDisabled = useServerZustand((z) => Object.keys(z.servers).length >= 10)
  const { enqueueSnackbar } = useSnackbar()

  const addServer = useCallback(() => {
    const serverZustand = useServerZustand.getState()
    const newPort = findAvailablePort(
      Object.values(serverZustand.servers).map((server) => Number(server.port))
    )

    // `findAvailablePort` walks 502 to 10502 and the button is off at ten
    // servers, so this answers for a range that cannot run out today. A throw
    // out of a click handler is an unhandled rejection the user never sees.
    if (!newPort) {
      enqueueSnackbar({ message: 'No free port between 502 and 10502', variant: 'error' })
      return
    }

    void serverZustand.createServer({ port: newPort, uuid: v4() })
  }, [enqueueSnackbar])

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

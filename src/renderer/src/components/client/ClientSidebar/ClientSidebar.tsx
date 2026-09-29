import Add from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import KeyboardDoubleArrowRight from '@mui/icons-material/KeyboardDoubleArrowRight'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useCallback, useMemo } from 'react'
import ClientCard from './ClientCard/ClientCard'
import ViewSwitch from './ViewSwitch'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { VERTICAL_IN_PARENT, useDragSensors } from '@renderer/components/shared/sortable'

/** Adds a client with the default configuration and selects it. */
export const addClient = (): void => {
  const clientZustand = useClientZustand.getState()
  clientZustand.addClient()
}

/** Every client, one card each, the selected one outlined. */
const ClientSidebar = meme(({ onCollapse }: { onCollapse: () => void }): JSX.Element => {
  const uuidKey = useClientZustand((z) => Object.keys(z.clients).join(' '))
  const uuids = useMemo(() => uuidKey.split(' '), [uuidKey])
  const handleAdd = useCallback(addClient, [])
  const sensors = useDragSensors()
  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return
      const clientZustand = useClientZustand.getState()
      clientZustand.moveClient(String(active.id), uuids.indexOf(String(over.id)))
    },
    [uuids]
  )

  return (
    <Box
      component="aside"
      data-testid="client-sidebar"
      sx={{
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        overflowY: 'auto'
      }}
    >
      <ViewSwitch />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pl: 0.5 }}>
        <Box
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: '#a3a3a3'
          }}
        >
          Clients
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 12,
            fontFamily: 'monospace',
            color: '#8a8a8a',
            background: '#2a2a2a',
            borderRadius: 1,
            px: 0.75
          }}
        >
          {uuids.length}
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton
          data-testid="client-sidebar-add-btn"
          aria-label="Add client"
          title="Add client"
          onClick={handleAdd}
        >
          <Add />
        </IconButton>
        <IconButton
          data-testid="client-sidebar-collapse-btn"
          aria-label="Hide sidebar"
          title="Hide sidebar"
          onClick={onCollapse}
        >
          <KeyboardDoubleArrowRight />
        </IconButton>
      </Box>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={VERTICAL_IN_PARENT}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={uuids} strategy={verticalListSortingStrategy}>
          {uuids.map((uuid) => (
            <ClientCard key={uuid} uuid={uuid} deletable={uuids.length > 1} />
          ))}
        </SortableContext>
      </DndContext>
      <Box sx={{ flexGrow: 1 }} />
      <Button
        data-testid="client-sidebar-new-btn"
        variant="outlined"
        color="inherit"
        size="large"
        startIcon={<Add />}
        onClick={handleAdd}
        sx={{ flexShrink: 0, borderStyle: 'dashed', borderColor: 'divider', color: '#bdbdbd' }}
      >
        New client
      </Button>
    </Box>
  )
})

export default ClientSidebar

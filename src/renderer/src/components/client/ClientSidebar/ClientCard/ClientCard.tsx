import { gridSurface, textMuted } from '@renderer/theme'
import StatusDot from '../StatusDot'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Tooltip from '@mui/material/Tooltip'
import ExpandMore from '@mui/icons-material/ExpandMore'
import MoreVert from '@mui/icons-material/MoreVert'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { PROTOCOL_LABELS } from '@shared'
import { ChangeEvent, KeyboardEvent, MouseEvent, useCallback, useMemo, useState } from 'react'
import { PROTOCOL_COLORS, clientAddress, clientStatus } from '../clientStatus'
import ProtocolIcon from '../ProtocolIcon'
import AddUnitRow from './AddUnitRow'
import ClientMenu from './ClientMenu'
import UnitRow from './UnitRow'
import { useSortable } from '@dnd-kit/sortable'
import { sortableStyle } from '@renderer/components/shared/sortable'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { VERTICAL_IN_PARENT, useDragSensors } from '@renderer/components/shared/sortable'
import { MenuPosition } from '@renderer/components/client/UnitMenu/UnitMenu'

interface ClientCardProps {
  uuid: string
  /** The last client left cannot be deleted. */
  deletable: boolean
}

const ClientCard = meme(({ uuid, deletable }: ClientCardProps): JSX.Element | null => {
  const selected = useClientZustand((z) => z.selectedUuid === uuid)
  const name = useClientZustand((z) => z.clients[uuid]?.name)
  const protocol = useClientZustand((z) => z.clients[uuid]?.connectionConfig.protocol)
  const address = useClientZustand((z) => {
    const config = z.clients[uuid]?.connectionConfig
    return config && clientAddress(config)
  })
  const connectState = useLiveZustand((z) => dataOf(z, uuid).clientState.connectState)
  const polling = useLiveZustand((z) => dataOf(z, uuid).clientState.polling)
  const offline = useLiveZustand((z) => dataOf(z, uuid).clientState.offlineUnits.length > 0)

  // Joined, so the answer compares equal while the units stay the same.
  const unitList = useClientZustand(
    (z) => z.clients[uuid]?.units.map((unit) => unit.uuid).join(',') ?? ''
  )
  const units = useMemo(() => (unitList === '' ? [] : unitList.split(',')), [unitList])

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const sortable = useSortable({ id: uuid })
  const sensors = useDragSensors()
  const handleUnitDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return
      const clientZustand = useClientZustand.getState()
      void clientZustand.moveUnit(uuid, String(active.id), units.indexOf(String(over.id)))
    },
    [uuid, units]
  )
  const [expanded, setExpanded] = useState(selected)
  const [renaming, setRenaming] = useState(false)

  const handleSelect = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setSelectedUuid(uuid)
  }, [uuid])
  // The scans in the menu act on the selected client, so opening it selects this one.
  const handleMenuOpen = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const clientZustand = useClientZustand.getState()
      clientZustand.setSelectedUuid(uuid)
      setMenuAnchor(event.currentTarget)
    },
    [uuid]
  )
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  // A right click on the card opens the same menu where the pointer is.
  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault()
      const clientZustand = useClientZustand.getState()
      clientZustand.setSelectedUuid(uuid)
      setMenuPosition({ left: event.clientX, top: event.clientY })
    },
    [uuid]
  )
  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null)
    setMenuPosition(null)
  }, [])
  const toggleExpanded = useCallback(() => setExpanded((open) => !open), [])
  // `setName` names the client on screen, so renaming waits until this one is.
  const startRenaming = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setSelectedUuid(uuid)
    if (useClientZustand.getState().selectedUuid === uuid) setRenaming(true)
  }, [uuid])
  const stopRenaming = useCallback(() => setRenaming(false), [])
  const handleName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setName(event.target.value)
  }, [])
  const handleNameKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === 'Escape') setRenaming(false)
  }, [])
  const handleCardKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'F2') startRenaming()
    },
    [startRenaming]
  )

  if (protocol === undefined || address === undefined) return null
  const status = clientStatus({ connectState, polling, offline })
  const color = PROTOCOL_COLORS[protocol]

  const face = (
    <>
      <Tooltip title={status.label} placement="left">
        <Box
          data-testid={`client-status-${uuid}`}
          aria-label={status.label}
          sx={{
            position: 'relative',
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: alpha(color, 0.16)
          }}
        >
          <ProtocolIcon protocol={protocol} />
          <StatusDot tone={status.tone} polling={status.polling} rim={gridSurface} offset={4} />
        </Box>
      </Tooltip>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0, flexGrow: 1 }}>
        {renaming ? (
          <InputBase
            autoFocus
            value={name ?? ''}
            onChange={handleName}
            onBlur={stopRenaming}
            onKeyDown={handleNameKey}
            placeholder="Unnamed client"
            inputProps={{ 'data-testid': `client-name-input-${uuid}`, 'aria-label': 'Client name' }}
            sx={{
              fontSize: 14,
              fontWeight: 500,
              height: 22,
              px: 0.5,
              border: '1px solid',
              borderColor: 'primary.main',
              borderRadius: 1
            }}
          />
        ) : (
          <Box
            component="span"
            sx={{
              fontSize: 14,
              fontWeight: 500,
              textAlign: 'left',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {name || 'Unnamed client'}
          </Box>
        )}
        <Box
          component="span"
          sx={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.05em',
            color,
            textAlign: 'left'
          }}
        >
          {PROTOCOL_LABELS[protocol].toUpperCase()}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 11.5,
            fontFamily: 'monospace',
            color: textMuted,
            textAlign: 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {address}
        </Box>
      </Box>
    </>
  )

  return (
    <Box
      ref={sortable.setNodeRef}
      style={sortableStyle(sortable)}
      sx={{
        flexShrink: 0,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 2,
        background: gridSurface,
        overflow: 'hidden'
      }}
    >
      {/* The head drags the card; the unit rows below drag themselves. */}
      <Box
        {...(renaming ? {} : sortable.listeners)}
        sx={{ display: 'flex', alignItems: 'center' }}
        onContextMenu={handleContextMenu}
      >
        {/* A field inside a button would take its clicks and keys, so the name is edited in a plain box. */}
        {renaming ? (
          <Box sx={{ display: 'flex', flexGrow: 1, minWidth: 0, gap: 1.25, p: 1.25 }}>{face}</Box>
        ) : (
          <ButtonBase
            data-testid={`client-card-${uuid}`}
            disableRipple
            aria-pressed={selected}
            onClick={handleSelect}
            onKeyDown={handleCardKey}
            sx={{ flexGrow: 1, minWidth: 0, gap: 1.25, p: 1.25, justifyContent: 'flex-start' }}
          >
            {face}
          </ButtonBase>
        )}
        <IconButton
          data-testid={`client-expand-${uuid}`}
          aria-label={expanded ? 'Hide units' : 'Show units'}
          aria-expanded={expanded}
          size="small"
          onClick={toggleExpanded}
        >
          <ExpandMore
            sx={{
              transform: expanded ? 'rotate(180deg)' : undefined,
              transition: 'transform 150ms'
            }}
          />
        </IconButton>
        <IconButton
          data-testid={`client-menu-${uuid}`}
          aria-label="Client menu"
          size="small"
          onClick={handleMenuOpen}
          sx={{ mr: 0.75 }}
        >
          <MoreVert />
        </IconButton>
      </Box>
      {expanded && (
        <Box
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            p: 0.75,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.25
          }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={VERTICAL_IN_PARENT}
            onDragEnd={handleUnitDragEnd}
          >
            <SortableContext items={units} strategy={verticalListSortingStrategy}>
              {units.map((unit) => (
                <UnitRow key={unit} uuid={uuid} unit={unit} />
              ))}
            </SortableContext>
          </DndContext>
          <AddUnitRow uuid={uuid} />
        </Box>
      )}
      <ClientMenu
        uuid={uuid}
        anchor={menuAnchor}
        position={menuPosition}
        onClose={handleMenuClose}
        onRename={startRenaming}
        deletable={deletable}
      />
    </Box>
  )
})

export default ClientCard

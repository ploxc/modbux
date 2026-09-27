import { barSurface, textBright, textMuted } from '@renderer/theme'
import Add from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import { meme } from '@renderer/components/shared/inputs/meme'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { ChangeEvent, KeyboardEvent, MouseEvent, useCallback, useMemo, useState } from 'react'
import UnitIdField from './UnitIdField'
import { useSortable } from '@dnd-kit/sortable'
import { sortableStyle } from '@renderer/components/shared/sortable'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { HORIZONTAL_IN_PARENT, useDragSensors } from '@renderer/components/shared/sortable'
import UnitMenu, { MenuPosition } from '@renderer/components/client/UnitMenu/UnitMenu'

interface UnitTabProps {
  unit: string
  index: number
}

/**
 * One unit: its id, its name, and a dot for whether a running poll hears it.
 * A double click names it; a double click on the id changes the id. A right
 * click opens the unit menu, which removes it too.
 */
const UnitTab = meme(({ unit, index }: UnitTabProps) => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const unitId = useClientZustand(
    (z) => z.clients[selectedUuid]?.units.find(({ uuid }) => uuid === unit)?.unitId
  )
  const name = useClientZustand(
    (z) => z.clients[selectedUuid]?.units.find(({ uuid }) => uuid === unit)?.name ?? ''
  )
  const selected = useClientZustand((z) => selectedUnit(z).uuid === unit)
  const polling = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.polling)
  const offline = useLiveZustand((z) =>
    dataOf(z, selectedUuid).clientState.offlineUnits.includes(unit)
  )
  const [naming, setNaming] = useState(false)
  const [numbering, setNumbering] = useState(false)
  const sortable = useSortable({ id: unit })
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)

  const handleSelect = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.selectUnit(unit)
  }, [unit])

  const handleName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setUnitName(event.target.value)
  }, [])

  const startNaming = useCallback(() => setNaming(true), [])
  // The badge's own double click, which the tab's would otherwise take as naming.
  const startNumbering = useCallback((event: MouseEvent) => {
    event.stopPropagation()
    setNumbering(true)
  }, [])
  const stopNumbering = useCallback(() => setNumbering(false), [])
  const stopNaming = useCallback(() => setNaming(false), [])
  const handleKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === 'Escape') setNaming(false)
  }, [])

  const openMenu = useCallback((event: MouseEvent) => {
    event.preventDefault()
    setMenuPosition({ left: event.clientX, top: event.clientY })
  }, [])
  const closeMenu = useCallback(() => setMenuPosition(null), [])
  const openNaming = useCallback(() => setNaming(true), [])
  const openNumbering = useCallback(() => setNumbering(true), [])

  return (
    <Box
      ref={sortable.setNodeRef}
      style={sortableStyle(sortable)}
      {...(naming || numbering ? {} : sortable.listeners)}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        borderTop: '2px solid',
        borderTopColor: selected ? theme.palette.primary.main : 'transparent',
        background: selected ? barSurface : 'transparent',
        color: selected ? textBright : textMuted
      })}
    >
      <ButtonBase
        role="tab"
        aria-selected={selected}
        data-testid={`unit-tab-${index}`}
        onClick={handleSelect}
        onDoubleClick={startNaming}
        onContextMenu={openMenu}
        sx={{ height: '100%', display: 'flex', alignItems: 'center', gap: 1, px: 1.5 }}
      >
        {numbering ? (
          <UnitIdField onDone={stopNumbering} />
        ) : (
          <Box
            component="span"
            onDoubleClick={startNumbering}
            title="Double click to change the unit ID"
            data-testid={`unit-id-badge-${index}`}
            sx={{
              fontFamily: 'monospace',
              fontSize: 11.5,
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              background: (theme) => theme.palette.action.selected
            }}
          >
            ID {unitId}
          </Box>
        )}
        {naming ? (
          <InputBase
            autoFocus
            value={name}
            onChange={handleName}
            onBlur={stopNaming}
            onKeyDown={handleKey}
            placeholder="Name"
            data-testid="unit-name-field"
            inputProps={{ 'data-testid': 'unit-name-input', 'aria-label': 'Unit name' }}
            // As wide as the name, so a long one does not scroll under the badge.
            sx={{ fontSize: 13, '& input': { fieldSizing: 'content', minWidth: 48 } }}
          />
        ) : (
          name !== '' && (
            <Box component="span" sx={{ fontSize: 13 }}>
              {name}
            </Box>
          )
        )}
        <Box
          component="span"
          aria-label={offline ? 'Offline' : polling ? 'Polling' : undefined}
          sx={(theme) => ({
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: !polling
              ? 'transparent'
              : offline
                ? theme.palette.error.main
                : theme.palette.success.main
          })}
        />
      </ButtonBase>
      <UnitMenu
        uuid={selectedUuid}
        unit={unit}
        position={menuPosition}
        onClose={closeMenu}
        onRename={openNaming}
        onRenumber={openNumbering}
      />
    </Box>
  )
})

/** The units of the client on screen, one tab each, and the button that adds one. */
const UnitTabs = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  // Joined, so the answer compares equal while the units stay the same.
  const unitList = useClientZustand(
    (z) => z.clients[selectedUuid]?.units.map(({ uuid }) => uuid).join(',') ?? ''
  )
  const units = useMemo(() => (unitList === '' ? [] : unitList.split(',')), [unitList])

  const handleAdd = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.addUnit()
  }, [])
  const sensors = useDragSensors()
  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return
      const clientZustand = useClientZustand.getState()
      void clientZustand.moveUnit(selectedUuid, String(active.id), units.indexOf(String(over.id)))
    },
    [selectedUuid, units]
  )

  return (
    <Box
      role="tablist"
      aria-label="Units"
      sx={(theme) => ({
        height: 34,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        background: theme.palette.background.paper
      })}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={HORIZONTAL_IN_PARENT}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={units} strategy={horizontalListSortingStrategy}>
          {units.map((unit, index) => (
            <UnitTab key={unit} unit={unit} index={index} />
          ))}
        </SortableContext>
      </DndContext>
      <IconButton
        size="small"
        aria-label="Add unit"
        data-testid="add-unit-btn"
        onClick={handleAdd}
        sx={{ alignSelf: 'center', ml: 0.5 }}
      >
        <Add sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  )
})

export default UnitTabs

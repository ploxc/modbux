import { textMuted } from '@renderer/theme'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import InputBase from '@mui/material/InputBase'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { ChangeEvent, KeyboardEvent, MouseEvent, useCallback, useState } from 'react'
import UnitIdField from '@renderer/components/client/ClientGrids/UnitIdField'

interface UnitRowProps {
  /** The client the unit belongs to. */
  uuid: string
  unit: string
}

/**
 * Shows this client and this unit. Answers whether both are on screen after,
 * which they are not while the selection is held.
 */
const showUnit = (uuid: string, unit: string): boolean => {
  const clientZustand = useClientZustand.getState()
  clientZustand.setSelectedUuid(uuid)
  if (useClientZustand.getState().selectedUuid !== uuid) return false
  clientZustand.selectUnit(unit)
  return true
}

/**
 * A unit in the client card: its id and its name, the id red while the unit
 * does not answer. A click shows it; a double click names it, and one on the
 * id changes the id.
 */
const UnitRow = meme(({ uuid, unit }: UnitRowProps) => {
  const unitId = useClientZustand(
    (z) => z.clients[uuid]?.units.find((found) => found.uuid === unit)?.unitId
  )
  const name = useClientZustand(
    (z) => z.clients[uuid]?.units.find((found) => found.uuid === unit)?.name ?? ''
  )
  const selected = useClientZustand(
    (z) => z.selectedUuid === uuid && z.sessions[uuid]?.selectedUnit === unit
  )
  const offline = useLiveZustand((z) => dataOf(z, uuid).clientState.offlineUnits.includes(unit))
  const [naming, setNaming] = useState(false)
  const [numbering, setNumbering] = useState(false)

  const handleSelect = useCallback(() => {
    showUnit(uuid, unit)
  }, [uuid, unit])
  // `setUnitName` names the unit on screen, so naming waits until this one is.
  const startNaming = useCallback(() => {
    if (showUnit(uuid, unit)) setNaming(true)
  }, [uuid, unit])
  const stopNaming = useCallback(() => setNaming(false), [])
  // The badge's own double click, which the row's would otherwise take as naming.
  // `UnitIdField` changes the unit on screen, so it waits until this one is.
  const startNumbering = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation()
      if (showUnit(uuid, unit)) setNumbering(true)
    },
    [uuid, unit]
  )
  const stopNumbering = useCallback(() => setNumbering(false), [])
  const handleName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setUnitName(event.target.value)
  }, [])
  const handleKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === 'Escape') setNaming(false)
  }, [])

  const badge = numbering ? (
    <UnitIdField onDone={stopNumbering} />
  ) : (
    <Box
      component="span"
      onDoubleClick={startNumbering}
      title="Double click to change the unit ID"
      data-testid={`client-unit-id-badge-${unit}`}
      sx={(theme) => ({
        minWidth: 40,
        flexShrink: 0,
        textAlign: 'center',
        py: 0.375,
        borderRadius: 1,
        fontFamily: 'monospace',
        fontSize: 11,
        background: offline ? alpha(theme.palette.error.main, 0.18) : theme.palette.action.selected,
        color: offline ? theme.palette.error.light : undefined
      })}
    >
      ID {unitId}
    </Box>
  )

  return (
    <ButtonBase
      data-testid={`client-unit-${unit}`}
      aria-pressed={selected}
      onClick={handleSelect}
      onDoubleClick={startNaming}
      sx={(theme) => ({
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 1.25,
        px: 1,
        py: 0.5,
        borderRadius: 1.5,
        textAlign: 'left',
        background: selected ? alpha(theme.palette.primary.main, 0.16) : 'transparent'
      })}
    >
      {badge}
      {naming ? (
        <InputBase
          autoFocus
          value={name}
          onChange={handleName}
          onBlur={stopNaming}
          onKeyDown={handleKey}
          placeholder="Name"
          inputProps={{
            'data-testid': `client-unit-name-input-${unit}`,
            'aria-label': 'Unit name'
          }}
          sx={{ flexGrow: 1, fontSize: 13 }}
        />
      ) : (
        <Box
          component="span"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            fontSize: 13,
            color: name === '' ? textMuted : undefined,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {name === '' ? 'Unnamed' : name}
        </Box>
      )}
    </ButtonBase>
  )
})

export default UnitRow

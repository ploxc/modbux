import Add from '@mui/icons-material/Add'
import Close from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import { meme } from '@renderer/components/shared/inputs/meme'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { ChangeEvent, KeyboardEvent, useCallback, useMemo, useState } from 'react'

interface UnitTabProps {
  unit: string
  index: number
}

/**
 * One unit: its id, its name, and a dot for whether a running poll hears it.
 * A double click names it.
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
  const unitCount = useClientZustand((z) => z.clients[selectedUuid]?.units.length ?? 0)
  const polling = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.polling)
  const offline = useLiveZustand((z) =>
    dataOf(z, selectedUuid).clientState.offlineUnits.includes(unit)
  )
  const [naming, setNaming] = useState(false)

  const handleSelect = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.selectUnit(unit)
  }, [unit])

  const handleName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setUnitName(event.target.value)
  }, [])

  const startNaming = useCallback(() => setNaming(true), [])
  const stopNaming = useCallback(() => setNaming(false), [])
  const handleKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === 'Escape') setNaming(false)
  }, [])

  const handleRemove = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.removeUnit(unit)
  }, [unit])

  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        borderTop: '2px solid',
        borderTopColor: selected ? theme.palette.primary.main : 'transparent',
        background: selected ? theme.palette.background.paper : 'transparent'
      })}
    >
      <ButtonBase
        role="tab"
        aria-selected={selected}
        data-testid={`unit-tab-${index}`}
        onClick={handleSelect}
        onDoubleClick={startNaming}
        sx={{ height: '100%', display: 'flex', alignItems: 'center', gap: 1, px: 1.5 }}
      >
        <Box
          component="span"
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
            sx={{ fontSize: 13, width: 120 }}
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
      {selected && unitCount > 1 && (
        <IconButton
          size="small"
          aria-label="Remove unit"
          data-testid="remove-unit-btn"
          onClick={handleRemove}
          sx={{ mr: 0.5 }}
        >
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      )}
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

  return (
    <Box
      role="tablist"
      aria-label="Units"
      sx={(theme) => ({
        height: 34,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: `1px solid ${theme.palette.divider}`
      })}
    >
      {units.map((unit, index) => (
        <UnitTab key={unit} unit={unit} index={index} />
      ))}
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

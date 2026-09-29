import ChevronRight from '@mui/icons-material/ChevronRight'
import ExpandMore from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import { alpha } from '@mui/material/styles'
import { showUnit } from '@renderer/components/client/UnitMenu/showUnit'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useClientViewZustand } from '@renderer/context/clientView.zustand'
import {
  REGISTER_TYPE_COLORS,
  REGISTER_TYPE_LABELS
} from '@renderer/components/client/RegisterConfig/RegisterConfig'
import { dataOf, sectionOf, useLiveZustand } from '@renderer/context/live.zustand'
import { AddressGroupResult, clientOwner, groupPoll } from '@shared'
import { ChangeEvent, useCallback } from 'react'
import { MonitorHeadRow, groupKey } from './monitorRows'
import { unitIn } from './MonitorCells'
import { useMonitorZustand } from './monitor.zustand'

/** How the last read of the group went, out of the groups Monitor last read for its type. */
const resultOf = (
  state: Parameters<typeof sectionOf>[0],
  uuid: string,
  { unit, type, group: [start, length] }: MonitorHeadRow
): AddressGroupResult | undefined => {
  const { addressGroups, groupResults } = sectionOf(state, uuid, unit, type, true)
  const index = addressGroups.findIndex(
    ([address, groupLength]) => address === start && groupLength === length
  )
  return index === -1 ? undefined : groupResults[index]
}

/**
 * One group's head: its unit, its type, how its last read went, and its Poll.
 * The Poll is on while a register in the group polls, and says so on hover
 * when some do not; a press turns all of them off, or all on.
 */
const GroupHead = meme(({ row }: { row: MonitorHeadRow }): JSX.Element => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  const unitId = useClientZustand((z) => unitIn(z, uuid, row.unit)?.unitId)
  const name = useClientZustand((z) => unitIn(z, uuid, row.unit)?.name)
  const poll = useClientZustand((z) =>
    groupPoll(row.type, unitIn(z, uuid, row.unit)?.registerMapping, row.group)
  )
  const folded = useMonitorZustand((z) => z.folded[groupKey(row.unit, row.type, row.group)])
  const roundTrip = useLiveZustand((z) => resultOf(z, uuid, row)?.roundTripMillis)
  const error = useLiveZustand((z) => resultOf(z, uuid, row)?.error)
  const read = useLiveZustand((z) => resultOf(z, uuid, row) !== undefined)
  const readDisabled = useLiveZustand(
    (z) =>
      dataOf(z, uuid).clientState.connectState !== 'connected' ||
      clientOwner(dataOf(z, uuid).clientState) !== undefined
  )

  const testId = `monitor-group-${unitId}-${row.type}-${row.group[0]}`

  const handleToggle = useCallback(() => {
    const monitorZustand = useMonitorZustand.getState()
    monitorZustand.toggleFolded(groupKey(row.unit, row.type, row.group))
  }, [row])

  // Debug opens on the unit's register type with the group as its window, so
  // Read there reads what this head reads.
  const handleShowUnit = useCallback(async () => {
    if (!showUnit(uuid, row.unit)) return
    const clientZustand = useClientZustand.getState()
    clientZustand.showType(row.type)
    const [start, length] = row.group
    await clientZustand.setAddress(String(start), true, row.type)
    await clientZustand.setLength(String(length), true, row.type)
    const clientViewZustand = useClientViewZustand.getState()
    clientViewZustand.setView('debug')
  }, [uuid, row])

  const handleRead = useCallback(() => {
    void window.api.readGroup({ uuid, unit: row.unit, type: row.type, group: row.group })
  }, [uuid, row])

  const handlePoll = useCallback(
    (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      const clientZustand = useClientZustand.getState()
      void clientZustand.setGroupPolled(row.unit, row.type, row.group, checked)
    },
    [row]
  )

  const status = error !== undefined ? 'error.main' : read ? 'success.main' : 'text.disabled'

  return (
    <Box
      data-testid={testId}
      sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.25, fontSize: 12.5 }}
    >
      <IconButton
        size="small"
        aria-label={folded ? 'Expand group' : 'Collapse group'}
        aria-expanded={!folded}
        data-testid={`${testId}-toggle`}
        onClick={handleToggle}
      >
        {folded ? <ChevronRight fontSize="small" /> : <ExpandMore fontSize="small" />}
      </IconButton>
      <Box
        component="span"
        sx={{
          fontFamily: 'monospace',
          fontSize: 11,
          lineHeight: '18px',
          px: 0.75,
          borderRadius: 1,
          bgcolor: 'divider'
        }}
      >
        ID {unitId}
      </Box>
      <Box component="span" sx={{ fontWeight: 500 }}>
        {name || 'Unnamed'}
      </Box>
      <Box
        component="span"
        sx={{
          fontSize: 11,
          lineHeight: '18px',
          px: 0.75,
          borderRadius: 1,
          color: REGISTER_TYPE_COLORS[row.type],
          bgcolor: alpha(REGISTER_TYPE_COLORS[row.type], 0.16)
        }}
      >
        {REGISTER_TYPE_LABELS[row.type]}
      </Box>
      <Box sx={{ flexGrow: 1 }} />
      <Box
        component="span"
        data-testid={`${testId}-round-trip`}
        sx={{ fontFamily: 'monospace', fontSize: 11.5, color: 'text.secondary' }}
      >
        {roundTrip !== undefined && `${roundTrip} ms`}
      </Box>
      <Box
        component="span"
        data-testid={`${testId}-status`}
        title={error ?? (read ? 'Read' : 'Not read yet')}
        sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: status, flexShrink: 0 }}
      />
      <Button
        size="small"
        variant="text"
        endIcon={<ChevronRight />}
        data-testid={`${testId}-show-unit`}
        onClick={handleShowUnit}
      >
        Show unit
      </Button>
      <Button
        size="small"
        variant="outlined"
        disabled={readDisabled}
        data-testid={`${testId}-read`}
        onClick={handleRead}
      >
        READ
      </Button>
      <FormControlLabel
        title={poll === 'mixed' ? 'Some registers are off' : undefined}
        label="Poll"
        labelPlacement="start"
        control={
          <Switch
            size="small"
            checked={poll !== 'off'}
            onChange={handlePoll}
            slotProps={{ input: { 'aria-label': 'Poll this group' } }}
            data-testid={`${testId}-poll`}
          />
        }
      />
    </Box>
  )
})

export default GroupHead

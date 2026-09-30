import Add from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import { REGISTER_TYPE_LABELS } from '@renderer/components/client/RegisterConfig/RegisterConfig'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { TREND_COLORS, textMuted } from '@renderer/theme'
import { ClientUnit, RegisterType } from '@shared'
import { ChangeEvent, MouseEvent, useCallback, useState } from 'react'
import { loggedRegisters } from './trendData'
import { trendKey, useTrendPanelZustand } from './trendPanel.zustand'

const NO_UNITS: ClientUnit[] = []

interface PickProps {
  uuid: string
  unit: string
  unitId: number
  type: RegisterType
  address: number
  /** The address as its unit's base writes it, and its name and engineering unit. */
  shown: number
  comment: string | undefined
  engineeringUnit: string | undefined
}

/** A register the picker offers: ticked while the trend draws it, and a press puts it in or out. */
const Pick = meme(
  ({
    uuid,
    unit,
    unitId,
    type,
    address,
    shown,
    comment,
    engineeringUnit
  }: PickProps): JSX.Element => {
    const key = trendKey({ uuid, unit, type, address })
    const drawn = useTrendPanelZustand((z) => z.entries.some((entry) => trendKey(entry) === key))
    const full = useTrendPanelZustand((z) => z.entries.length >= TREND_COLORS.length)
    const handleChange = useCallback(() => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.toggle({ uuid, unit, type, address })
    }, [uuid, unit, type, address])

    return (
      <Box
        component="label"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          height: 28,
          pr: 1,
          borderRadius: '4px',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' }
        }}
      >
        <Checkbox
          size="small"
          checked={drawn}
          disabled={full && !drawn}
          onChange={handleChange}
          data-testid={`trend-pick-${unitId}-${type}-${shown}`}
          sx={{ p: 0.5 }}
        />
        <Box component="span" sx={{ fontFamily: 'monospace', minWidth: 44 }}>
          {shown}
        </Box>
        <Box
          component="span"
          sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {comment ?? REGISTER_TYPE_LABELS[type]}
        </Box>
        <Box component="span" sx={{ fontSize: 11.5, color: textMuted }}>
          {engineeringUnit}
        </Box>
      </Box>
    )
  }
)

/**
 * The trend's Add register: a list of what logs in the trend's client, by
 * unit, found by address or name, each ticked while the trend draws it. A
 * trend full of colours offers no more.
 */
const TrendPicker = meme((): JSX.Element => {
  const uuid = useTrendPanelZustand((z) => z.uuid)
  const units = useClientZustand((z) => z.clients[uuid]?.units ?? NO_UNITS)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [search, setSearch] = useState('')

  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => {
    setAnchor(null)
    setSearch('')
  }, [])
  const handleSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value)
  }, [])

  const wanted = search.trim().toLowerCase()
  const groups = units.map((unit) => ({
    unit,
    picks: loggedRegisters(unit)
      .map(({ type, address }) => {
        const mapValue = unit.registerMapping[type][address]
        return {
          type,
          address,
          shown: address + Number(unit.addressBase),
          comment: mapValue?.comment || undefined,
          engineeringUnit: mapValue?.unit
        }
      })
      .filter(
        ({ shown, comment }) =>
          wanted === '' ||
          String(shown).includes(wanted) ||
          (comment?.toLowerCase().includes(wanted) ?? false)
      )
  }))

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        startIcon={<Add sx={{ fontSize: 14 }} />}
        data-testid="trend-add-btn"
        onClick={handleOpen}
        sx={{
          height: 24,
          py: 0,
          fontSize: 12,
          textTransform: 'none',
          borderRadius: '12px',
          borderStyle: 'dashed',
          color: 'text.secondary'
        }}
      >
        Add register
      </Button>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 330, p: 1, fontSize: 12.5 } } }}
      >
        <TextField
          size="small"
          fullWidth
          autoFocus
          placeholder="Find a register"
          value={search}
          onChange={handleSearch}
          slotProps={{ htmlInput: { 'data-testid': 'trend-add-search' } }}
          sx={{ mb: 0.5 }}
        />
        <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
          {groups.map(({ unit, picks }) =>
            picks.length === 0 ? null : (
              <Box key={unit.uuid}>
                <Box sx={{ px: 1, pt: 1, pb: 0.25, fontSize: 11, color: textMuted }}>
                  ID {unit.unitId} · {unit.name || 'Unnamed'}
                </Box>
                {picks.map((pick) => (
                  <Pick
                    key={`${pick.type}|${pick.address}`}
                    uuid={uuid}
                    unit={unit.uuid}
                    unitId={unit.unitId}
                    {...pick}
                  />
                ))}
              </Box>
            )
          )}
        </Box>
        <Box sx={{ px: 1, pt: 0.75, fontSize: 11, color: textMuted }}>
          Registers that log. Up to {TREND_COLORS.length} in one trend.
        </Box>
      </Popover>
    </>
  )
})

export default TrendPicker

import Box from '@mui/material/Box'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import { meme } from '@renderer/components/shared/inputs/meme'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { textMuted } from '@renderer/theme'
import { isNumberRegister, LogSetting } from '@shared'
import { ChangeEvent, MouseEvent, useCallback, useState } from 'react'

type LogMode = 'off' | LogSetting['mode']

interface LogPopoverProps {
  address: number
  anchor: HTMLElement
  onClose: () => void
}

/**
 * How one register logs: not at all, on every poll, or on a change past a
 * deadband in the raw value, 0 by default so that every change is kept. Each
 * choice is written to the mapping as it is made.
 */
const LogPopover = meme(({ address, anchor, onClose }: LogPopoverProps) => {
  const type = useSectionType()
  const setting = useClientZustand((z) => selectedUnit(z).registerMapping[type][address]?.log)
  const dataType = useClientZustand((z) => selectedUnit(z).registerMapping[type][address]?.dataType)
  const deadband = setting?.mode === 'change' ? setting.deadband : 0
  const [deadbandText, setDeadbandText] = useState(String(deadband))

  const handleMode = useCallback(
    (_event: MouseEvent<HTMLElement>, mode: LogMode | null) => {
      if (mode === null) return
      const clientZustand = useClientZustand.getState()
      const next: LogSetting | undefined =
        mode === 'off'
          ? undefined
          : mode === 'poll'
            ? { mode }
            : { mode, deadband: Number(deadbandText) >= 0 ? Number(deadbandText) : 0 }
      clientZustand.setRegisterMapping(type, address, 'log', next)
    },
    [type, address, deadbandText]
  )

  // A deadband is written once it reads as a number of 0 or more; the field
  // keeps what was typed until then.
  const handleDeadband = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value
      setDeadbandText(text)
      const value = Number(text)
      if (text.trim() === '' || !Number.isFinite(value) || value < 0) return
      const clientZustand = useClientZustand.getState()
      clientZustand.setRegisterMapping(type, address, 'log', { mode: 'change', deadband: value })
    },
    [type, address]
  )

  const title = isNumberRegister(type) ? `Log · ${dataType?.toUpperCase() ?? ''}` : 'Log · BIT'

  return (
    <Popover
      open
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { p: 1.5, width: 260 } } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>{title}</Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="medium"
          value={setting?.mode ?? 'off'}
          onChange={handleMode}
          aria-label="Log mode"
        >
          <ToggleButton value="off" data-testid="log-mode-off">
            Off
          </ToggleButton>
          <ToggleButton value="poll" data-testid="log-mode-poll">
            Every poll
          </ToggleButton>
          <ToggleButton value="change" data-testid="log-mode-change">
            On change
          </ToggleButton>
        </ToggleButtonGroup>
        {setting?.mode === 'change' && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12.5 }}>
              <span>Deadband</span>
              <TextField
                size="medium"
                value={deadbandText}
                onChange={handleDeadband}
                error={!(Number(deadbandText) >= 0) || deadbandText.trim() === ''}
                slotProps={{
                  htmlInput: {
                    inputMode: 'decimal',
                    'aria-label': 'Deadband',
                    'data-testid': 'log-deadband-input'
                  }
                }}
                sx={{ width: 90 }}
              />
              <Box component="span" sx={{ color: textMuted }}>
                raw
              </Box>
            </Box>
            <Typography sx={{ fontSize: 11.5, lineHeight: 1.45, color: textMuted }}>
              A sample is kept when the raw value moves more than this from the last one kept, and
              on every error. At 0, every change.
            </Typography>
          </>
        )}
      </Box>
    </Popover>
  )
})

export default LogPopover

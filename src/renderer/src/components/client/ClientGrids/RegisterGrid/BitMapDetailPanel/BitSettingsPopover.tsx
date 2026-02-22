import { Box, Paper, Popover, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { BitColor } from '@shared'

interface BitSettingsPopoverProps {
  anchorEl: HTMLElement | null
  onClose: () => void
  color: BitColor | undefined
  invert: boolean
  onColorChange: (color: BitColor | undefined) => void
  onInvertChange: (invert: boolean) => void
}

const COLOR_OPTIONS: { value: BitColor; palette: 'success' | 'warning' | 'error' }[] = [
  { value: 'default', palette: 'success' },
  { value: 'warning', palette: 'warning' },
  { value: 'error', palette: 'error' }
]

const BitSettingsPopover = ({
  anchorEl,
  onClose,
  color,
  invert,
  onColorChange,
  onInvertChange
}: BitSettingsPopoverProps): JSX.Element => {
  const selected = color ?? 'default'

  return (
    <Popover
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      slotProps={{
        paper: { sx: { bgcolor: 'transparent', boxShadow: 'none', overflow: 'visible' } }
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          borderRadius: 2,
          minWidth: 100
        }}
      >
        {/* Invert toggle */}
        <ToggleButtonGroup size="small" value={invert} color="primary" fullWidth>
          <ToggleButton
            value={true}
            onChange={() => onInvertChange(!invert)}
            sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
          >
            Invert
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Color swatches */}
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', px: 0.5, py: 0.4 }}>
          {COLOR_OPTIONS.map(({ value, palette }) => {
            const isSelected = selected === value
            return (
              <Box
                key={value}
                onClick={() => onColorChange(value === 'default' ? undefined : value)}
                sx={(theme) => ({
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: theme.palette[palette].main,
                  cursor: 'pointer',
                  outline: isSelected
                    ? `2px solid ${theme.palette[palette].main}`
                    : '2px solid transparent',
                  outlineOffset: 2,
                  boxShadow: isSelected
                    ? `0 0 8px ${alpha(theme.palette[palette].main, 0.5)}`
                    : 'none',
                  transition: 'outline 0.15s, box-shadow 0.15s, transform 0.1s',
                  '&:hover': {
                    transform: 'scale(1.15)',
                    boxShadow: `0 0 8px ${alpha(theme.palette[palette].main, 0.4)}`
                  }
                })}
              />
            )
          })}
        </Box>
      </Paper>
    </Popover>
  )
}

export default BitSettingsPopover

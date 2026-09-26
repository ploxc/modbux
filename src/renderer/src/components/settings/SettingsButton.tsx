import SettingsIcon from '@mui/icons-material/Settings'
import IconButton, { IconButtonProps } from '@mui/material/IconButton'
import { SxProps, Theme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useState } from 'react'
import Settings from './Settings'
import { lineColor } from '@renderer/theme'

interface SettingsButtonProps {
  testId: string
  size?: IconButtonProps['size']
  variant?: 'outlined'
  sx?: SxProps<Theme>
}

/** Opens the settings, where an assistant is let in. */
const SettingsButton = meme(({ testId, size, variant, sx }: SettingsButtonProps): JSX.Element => {
  const [open, setOpen] = useState(false)
  const handleOpen = useCallback((): void => setOpen(true), [])
  const handleClose = useCallback((): void => setOpen(false), [])

  return (
    <>
      <IconButton
        data-testid={testId}
        aria-label="Settings"
        title="Settings"
        size={size}
        onClick={handleOpen}
        sx={[
          variant === 'outlined' && { border: `1px solid ${lineColor}` },
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
      >
        <SettingsIcon />
      </IconButton>
      <Settings open={open} onClose={handleClose} />
    </>
  )
})

export default SettingsButton

import Close from '@mui/icons-material/Close'
import SettingsIcon from '@mui/icons-material/Settings'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import { meme } from '@renderer/components/shared/inputs/meme'
import McpSettings from './McpSettings'
import ConnectionSettingsSection from './ConnectionSettings'

interface SettingsProps {
  open: boolean
  onClose: () => void
}

/**
 * The settings, over Home. Every section is set for the whole app. The dialog
 * unmounts its content when it closes, which is what forgets a shown token.
 */
const Settings = meme(
  ({ open, onClose }: SettingsProps): JSX.Element => (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      data-testid="settings-modal"
      slotProps={{ paper: { sx: { width: 640 } } }}
    >
      <DialogTitle
        sx={{ gap: 1.5, pt: 2.25, pr: 2, pb: 1.75, pl: 3, borderBottom: '1px solid #2a2a2a' }}
      >
        <SettingsIcon sx={{ fontSize: 20, color: '#a3a3a3' }} />
        <Box component="span" sx={{ fontSize: 18, flexGrow: 1 }}>
          Settings
        </Box>
        <IconButton
          aria-label="Close"
          size="small"
          onClick={onClose}
          data-testid="settings-close-btn"
        >
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      {/* 18 px on the right against 12 on the left, on both sides of a
          gutter kept whether or not the box scrolls. */}
      <Box
        sx={{
          maxHeight: 600,
          overflowY: 'auto',
          scrollbarGutter: 'stable both-edges',
          pt: 1,
          pr: 2.25,
          pb: 2,
          pl: 1.5
        }}
      >
        <McpSettings />
        <ConnectionSettingsSection />
      </Box>
      <DialogActions>
        <Button onClick={onClose} data-testid="settings-done-btn">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  )
)

export default Settings

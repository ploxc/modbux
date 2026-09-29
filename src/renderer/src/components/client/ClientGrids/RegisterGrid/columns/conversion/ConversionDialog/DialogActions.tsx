import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'

interface DialogActionsProps {
  canSave: boolean
  onCancel: () => void
  onSave: () => void
}

/** Cancel, which keeps what the register had, and Save. */
const DialogActions = meme(({ canSave, onCancel, onSave }: DialogActionsProps) => (
  <Box
    sx={(theme) => ({
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 1,
      px: 2,
      py: 1.25,
      borderTop: `1px solid ${theme.palette.divider}`
    })}
  >
    <Button data-testid="conversion-cancel-btn" variant="text" color="inherit" onClick={onCancel}>
      Cancel
    </Button>
    <Button
      data-testid="conversion-save-btn"
      variant="outlined"
      disabled={!canSave}
      onClick={onSave}
    >
      Save
    </Button>
  </Box>
))

export default DialogActions

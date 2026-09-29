import Close from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { DRAG_HANDLE_CLASS } from '@renderer/components/shared/DraggablePopover/DraggablePopover'
import { meme } from '@renderer/components/shared/inputs/meme'

interface DialogTitleProps {
  /** The register: its address, data type and name. */
  subject: string
  onClose: () => void
}

/** The title, which is what the dialog drags by, the register it is about, and a close. */
const DialogTitle = meme(({ subject, onClose }: DialogTitleProps) => (
  <Box
    className={DRAG_HANDLE_CLASS}
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.25,
      pl: 2,
      pr: 1.5,
      py: 1.5,
      userSelect: 'none',
      cursor: 'move'
    }}
  >
    <Box sx={{ fontSize: 15, fontWeight: 500 }}>Conversion</Box>
    <Box
      title={subject}
      sx={{
        fontFamily: 'monospace',
        fontSize: 12,
        color: 'text.secondary',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden'
      }}
    >
      {subject}
    </Box>
    <IconButton
      sx={{ ml: 'auto' }}
      data-testid="conversion-close-btn"
      title="Close conversion window"
      size="small"
      onClick={onClose}
    >
      <Close fontSize="small" />
    </IconButton>
  </Box>
))

export default DialogTitle

import Box from '@mui/material/Box'
import DialogTitle from '@mui/material/DialogTitle'
import { meme } from '@renderer/components/shared/inputs/meme'
import { DIALOG_ICON_SIZE } from '@renderer/theme'
import { ReactNode } from 'react'

/** The badge's tint and the icon's colour, per what the dialog is about. */
const TONES = {
  primary: { background: 'rgba(91,146,121,0.18)', color: '#b5dcc9' },
  success: { background: 'rgba(129,188,87,0.16)', color: '#a5d38a' },
  warning: { background: 'rgba(249,166,32,0.14)', color: '#f5c46e' },
  error: { background: 'rgba(224,115,95,0.14)', color: '#ec9a8a' }
} as const

interface DialogHeadingProps {
  icon: ReactNode
  tone: keyof typeof TONES
  children: ReactNode
  /** A line under the title, for a dialog whose fields need saying what they do. */
  subtitle?: ReactNode
}

/**
 * A dialog's title row: a round badge holding an icon, then the title. The
 * theme's `MuiDialogTitle` lays the row out and indents `DialogContent` past
 * the badge.
 */
const DialogHeading = meme(
  ({ icon, tone, children, subtitle }: DialogHeadingProps): JSX.Element => (
    <DialogTitle>
      <Box
        component="span"
        sx={{
          ...TONES[tone],
          width: DIALOG_ICON_SIZE,
          height: DIALOG_ICON_SIZE,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '& .MuiSvgIcon-root': { fontSize: 18 }
        }}
      >
        {icon}
      </Box>
      {subtitle ? (
        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="dialog-title-text">{children}</span>
          <Box component="span" sx={{ fontSize: 12, lineHeight: '17px', color: '#a3a3a3' }}>
            {subtitle}
          </Box>
        </Box>
      ) : (
        <span className="dialog-title-text">{children}</span>
      )}
    </DialogTitle>
  )
)

export default DialogHeading

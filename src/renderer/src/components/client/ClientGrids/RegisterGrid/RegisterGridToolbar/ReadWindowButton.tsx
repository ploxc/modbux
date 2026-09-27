import ArrowDropDown from '@mui/icons-material/ArrowDropDown'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import RegisterConfig from '@renderer/components/client/RegisterConfig/RegisterConfig'
import { meme } from '@renderer/components/shared/inputs/meme'
import { MouseEvent, useCallback, useState } from 'react'

/** The class the section head hides this button by while the fields fit inline. */
export const READ_WINDOW_TOGGLE = 'read-window-toggle'

/**
 * The half of the Read split button that opens the read window, Address and
 * Length, when the section head is too narrow to show them inline.
 */
const ReadWindowButton = meme((): JSX.Element => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])

  return (
    <>
      <Button
        className={READ_WINDOW_TOGGLE}
        data-testid="read-window-btn"
        aria-label="Read window"
        size="small"
        variant="outlined"
        onClick={handleOpen}
      >
        <ArrowDropDown />
      </Button>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 0.5 } } }}
      >
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1.5, pt: 2 }}>
          <RegisterConfig />
        </Box>
      </Popover>
    </>
  )
})

export default ReadWindowButton

import { useScanRegistersZustand } from '@renderer/components/client/ScanRegisters/scanRegisters.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useRef, useState } from 'react'
import LoadDummyDataButton from './LoadDummyDataButton'
import MenuConnectionOptions from './MenuConnectionOptions'
import MenuRegisterOptions from './MenuRegisterOptions'
import ScanRegistersButton from './ScanRegistersButton'
import ScanUnitIdsButton from './ScanUnitIdsButton'
import FormGroup from '@mui/material/FormGroup'
import Button from '@mui/material/Button'
import Settings from '@mui/icons-material/Settings'
import Popover from '@mui/material/Popover'

/** What a menu entry needs to close the menu it was pressed in. */
export interface SetAnchorProps {
  setAnchor: (anchor: HTMLDivElement | null) => void
}

const MenuContent = meme(({ setAnchor }: SetAnchorProps) => {
  return (
    <FormGroup>
      <MenuRegisterOptions />
      <MenuConnectionOptions />
      <ScanUnitIdsButton setAnchor={setAnchor} />
      <ScanRegistersButton setAnchor={setAnchor} />
      <LoadDummyDataButton setAnchor={setAnchor} />
    </FormGroup>
  )
})

// Menu button for extra options menu
const MenuButton = meme((): JSX.Element => {
  const scanRegistersOpen = useScanRegistersZustand((z) => z.open)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  return (
    <>
      <Button
        data-testid="menu-btn"
        aria-label="More options"
        title="More options"
        ref={buttonRef}
        size="small"
        variant={'outlined'}
        onClick={() => setAnchor(buttonRef.current)}
        sx={{ minWidth: 40 }}
      >
        <Settings />
      </Button>
      <Popover
        sx={{
          mt: 1,
          background: 'transparent',
          visibility: scanRegistersOpen ? 'hidden' : undefined
        }}
        slotProps={{ paper: { sx: { px: 2, py: 1 } } }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
      >
        <MenuContent setAnchor={setAnchor} />
      </Popover>
    </>
  )
})

export default MenuButton

import ScanRegisters, {
  useScanRegistersZustand
} from '@renderer/components/client/ClientGrids/RegisterGrid/RegisterGridToolbar/MenuButton/ScanRegistersButton/ScanRegisters/ScanRegisters'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useRef, useState } from 'react'
import LoadDummyDataButton from './LoadDummyDataButton/LoadDummyDataButton'
import MenuRegisterOptions from './MenuRegisterOptions/MenuRegisterOptions'
import ScanRegistersButton, { SetAnchorProps } from './ScanRegistersButton/ScanRegistersButton'
import ScanUnitIds from './ScanUnitIds/ScanUnitIds'
import FormGroup from '@mui/material/FormGroup'
import Button from '@mui/material/Button'
import { Settings } from '@mui/icons-material'
import Popover from '@mui/material/Popover'

const MenuContent = meme(({ setAnchor }: SetAnchorProps) => {
  return (
    <FormGroup>
      <MenuRegisterOptions />

      <ScanUnitIds />
      <ScanRegistersButton setAnchor={setAnchor} />
      <LoadDummyDataButton setAnchor={setAnchor} />
    </FormGroup>
  )
})

// Menu button for extra options menu
const MenuButton = () => {
  const scanRegistersOpen = useScanRegistersZustand((z) => z.open)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  return (
    <>
      <Button
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
}

export default MenuButton

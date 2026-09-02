import Button from '@mui/material/Button'
import { useScanRegistersZustand } from '@renderer/components/client/ClientGrids/RegisterGrid/RegisterGridToolbar/MenuButton/ScanRegistersButton/ScanRegisters/scanRegisters.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useCallback } from 'react'

export interface SetAnchorProps {
  setAnchor: (anchor: HTMLDivElement | null) => void
}

const ScanRegistersButton = meme(({ setAnchor }: SetAnchorProps) => {
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'connected')
  const type = useClientZustand((z) => z.registerConfig.type)
  const registers16Bit = ['input_registers', 'holding_registers'].includes(type)

  const handleOpen = useCallback(() => {
    useScanRegistersZustand.getState().setOpen(true)
    setAnchor(null)
  }, [setAnchor])

  const text = registers16Bit ? 'Scan Registers' : 'Scan TRUE Bits'
  return (
    <Button
      disabled={disabled}
      sx={{ my: 1 }}
      size="small"
      variant="outlined"
      onClick={handleOpen}
      data-testid="scan-registers-btn"
    >
      {text}
    </Button>
  )
})

export default ScanRegistersButton

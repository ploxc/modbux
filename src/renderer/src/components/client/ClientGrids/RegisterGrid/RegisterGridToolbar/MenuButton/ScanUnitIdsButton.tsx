import Button from '@mui/material/Button'
import { useScanUnitIdZustand } from '@renderer/components/client/ScanUnitIds/scanUnitIds.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand, dataOf } from '@renderer/context/data.zustand'
import { useCallback } from 'react'
import type { SetAnchorProps } from './MenuButton'
import { useClientZustand } from '@renderer/context/client.zustand'

const ScanUnitIdsButton = meme(({ setAnchor }: SetAnchorProps): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useDataZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'connected'
  )

  // Close the menu behind it, the way scanning registers does. Otherwise it is
  // still hanging there when you close the dialog again.
  const handleOpen = useCallback(() => {
    useScanUnitIdZustand.getState().setOpen(true)
    setAnchor(null)
  }, [setAnchor])

  return (
    <Button
      disabled={disabled}
      sx={{ my: 1 }}
      size="small"
      variant="outlined"
      onClick={handleOpen}
      data-testid="scan-unitids-btn"
    >
      Scan Unit ID{`'`}s
    </Button>
  )
})

export default ScanUnitIdsButton

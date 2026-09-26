import Button from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import {
  useLiveZustand,
  dataOf,
  sectionOf,
  setShownRegisterData
} from '@renderer/context/live.zustand'
import { useCallback } from 'react'
import { useClientZustand, selectedUnit, shownType } from '@renderer/context/client.zustand'

const ClearButton = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const unit = useClientZustand((z) => selectedUnit(z).uuid)
  const type = useClientZustand((z) => shownType(z))
  const noData = useLiveZustand(
    (z) => sectionOf(z, selectedUuid, unit, type).registerData.length === 0
  )
  const polling = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.polling)
  const disabled = noData || polling

  const handleClear = useCallback((): void => setShownRegisterData([]), [])

  return (
    <Button
      data-testid="clear-data-btn"
      disabled={disabled}
      size="small"
      variant="outlined"
      onClick={handleClear}
    >
      Clear
    </Button>
  )
})

export default ClearButton

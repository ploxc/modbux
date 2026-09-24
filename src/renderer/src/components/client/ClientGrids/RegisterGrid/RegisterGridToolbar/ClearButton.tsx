import Button from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { useCallback } from 'react'
import { useClientZustand, selectedClientUuid } from '@renderer/context/client.zustand'

const ClearButton = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const noData = useLiveZustand((z) => dataOf(z, selectedUuid).registerData.length === 0)
  const polling = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.polling)
  const disabled = noData || polling

  const handleClear = useCallback((): void => {
    useLiveZustand.getState().setRegisterData(selectedClientUuid(), [])
  }, [])

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

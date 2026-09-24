import Button from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand, dataOf } from '@renderer/context/data.zustand'
import { useCallback } from 'react'
import { useClientZustand, selectedClientUuid } from '@renderer/context/client.zustand'

const ClearButton = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const noData = useDataZustand((z) => dataOf(z, selectedUuid).registerData.length === 0)
  const polling = useDataZustand((z) => dataOf(z, selectedUuid).clientState.polling)
  const disabled = noData || polling

  const handleClear = useCallback((): void => {
    useDataZustand.getState().setRegisterData(selectedClientUuid(), [])
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

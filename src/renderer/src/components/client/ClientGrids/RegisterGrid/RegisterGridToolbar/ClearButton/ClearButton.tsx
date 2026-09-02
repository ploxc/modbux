import Button from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useCallback } from 'react'

const ClearButton = meme((): JSX.Element => {
  const noData = useDataZustand((z) => z.registerData.length === 0)
  const polling = useClientZustand((z) => z.clientState.polling)
  const disabled = noData || polling
  const setRegisterData = useDataZustand((z) => z.setRegisterData)

  const handleClear = useCallback(() => {
    setRegisterData([])
  }, [setRegisterData])

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

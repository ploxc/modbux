import Button from '@mui/material/Button'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useCallback } from 'react'

const ClearButton = (): JSX.Element => {
  const noData = useDataZustand((z) => z.registerData.length === 0)
  const polling = useRootZustand((z) => z.clientState.polling)
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
}

export default ClearButton

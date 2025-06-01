import Button from '@mui/material/Button'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useCallback } from 'react'

const ClearButton = () => {
  const disabled = useDataZustand(
    (z) => z.registerData.length === 0 || useRootZustand.getState().clientState.polling
  )
  const setRegisterData = useDataZustand((z) => z.setRegisterData)

  const handleClear = useCallback(() => {
    setRegisterData([])
  }, [])

  return (
    <Button disabled={disabled} size="small" variant="outlined" onClick={handleClear}>
      Clear
    </Button>
  )
}

export default ClearButton

import { Delete } from '@mui/icons-material'
import IconButton from '@mui/material/IconButton'

import { useRootZustand } from '@renderer/context/root.zustand'
import { useCallback, useState } from 'react'

const ClearConfigButton = (): JSX.Element => {
  const [warn, setWarn] = useState(false)

  const handleClick = useCallback(() => {
    useRootZustand.getState().setName('')
    useRootZustand.getState().clearRegisterMapping()
    useRootZustand.getState().setReadConfiguration(false)
  }, [])

  return (
    <IconButton
      data-testid="clear-config-btn"
      aria-label="Clear configuration"
      size="small"
      onClick={handleClick}
      color={warn ? 'error' : 'primary'}
      title="clear datatype, scaling and comment configuration"
      onMouseEnter={() => setWarn(true)}
      onMouseLeave={() => setWarn(false)}
    >
      <Delete fontSize="small" />
    </IconButton>
  )
}

export default ClearConfigButton

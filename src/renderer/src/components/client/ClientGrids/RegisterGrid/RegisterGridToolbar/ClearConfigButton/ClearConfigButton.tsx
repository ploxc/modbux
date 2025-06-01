import { Delete } from '@mui/icons-material'
import IconButton from '@mui/material/IconButton'

import { useRootZustand } from '@renderer/context/root.zustand'
import { useState } from 'react'

const ClearConfigButton = () => {
  const clearRegisterMapping = useRootZustand((z) => z.clearRegisterMapping)

  const [warn, setWarn] = useState(false)

  return (
    <IconButton
      size="small"
      onClick={clearRegisterMapping}
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

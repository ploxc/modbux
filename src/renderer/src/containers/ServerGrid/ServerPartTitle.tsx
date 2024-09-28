import { PlusCircleFilled } from '@ant-design/icons'
import { Box, IconButton } from '@mui/material'
import { RegisterType } from '@shared'
import { useRef, useCallback } from 'react'
import AddBooleans, { useAddBooleansZustand } from './ServerBooleans/AddBooleans'

const ServerPartTitle = ({ name, type }: { name: string; type: RegisterType }) => {
  const titleRef = useRef<HTMLDivElement>(null)
  const handleClick = useCallback(() => {
    if (type === RegisterType.Coils || type === RegisterType.DiscreteInputs) {
      const setAddBooleansOpen = useAddBooleansZustand.getState().setAnchorEl
      setAddBooleansOpen(titleRef.current, type)
    }
  }, [type])

  return (
    <Box
      ref={titleRef}
      sx={(theme) => ({
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: 38,
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: theme.palette.background.default,
        borderBottom: '1px solid rgba(255, 255, 255, 0.12)'
      })}
    >
      <Box sx={{ width: 32 }}></Box>
      <Box sx={{ flex: 1, flexBasis: 0, textAlign: 'center' }}>{name}</Box>
      <Box sx={{ width: 32 }}>
        <IconButton size="small" color="primary">
          <PlusCircleFilled size={10} onClick={handleClick} />
        </IconButton>
      </Box>
      {[RegisterType.Coils, RegisterType.DiscreteInputs].includes(type) ? <AddBooleans /> : null}
    </Box>
  )
}

export default ServerPartTitle

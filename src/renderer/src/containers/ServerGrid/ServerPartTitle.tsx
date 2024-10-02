import { DeleteFilled, EditFilled, PlusCircleFilled } from '@ant-design/icons'
import { Box, IconButton } from '@mui/material'
import { RegisterType } from '@shared'
import { useRef, useCallback, MutableRefObject } from 'react'
import AddBooleans, { useAddBooleansZustand } from './ServerBooleans/AddBooleans'
import AddRegister from './ServerRegisters/AddRegister'
import { useAddRegisterZustand } from './ServerRegisters/addRegister.zustand'
import { meme } from '@renderer/components/meme'
import { useServerZustand } from '@renderer/context/server.zustand'

const AddEdit = meme(({ type }: { type: RegisterType }) => {
  return [RegisterType.Coils, RegisterType.DiscreteInputs].includes(type) ? (
    <AddBooleans />
  ) : (
    <AddRegister />
  )
})

const AddButton = meme(
  ({
    type,
    titleRef
  }: {
    type: RegisterType
    titleRef: MutableRefObject<HTMLDivElement | null>
  }) => {
    const handleClick = useCallback(() => {
      if (type === RegisterType.Coils || type === RegisterType.DiscreteInputs) {
        const setAddBooleansOpen = useAddBooleansZustand.getState().setAnchorEl
        setAddBooleansOpen(titleRef.current, type)
      }
      if (type === RegisterType.InputRegisters || type === RegisterType.HoldingRegisters) {
        const setRegisterType = useAddRegisterZustand.getState().setRegisterType
        setRegisterType(type)
      }
    }, [type])

    const icon =
      type === RegisterType.Coils || type === RegisterType.DiscreteInputs ? (
        <EditFilled size={10} />
      ) : (
        <PlusCircleFilled size={10} />
      )
    return (
      <IconButton onClick={handleClick} size="small" color="primary">
        {icon}
      </IconButton>
    )
  }
)

const DeleteButton = meme(({ type }: { type: RegisterType }) => {
  const handleClick = useCallback(() => {
    if (type === RegisterType.Coils || type === RegisterType.DiscreteInputs) {
      useServerZustand.getState().resetBools(type)
    }
    if (type === RegisterType.InputRegisters || type === RegisterType.HoldingRegisters) {
      useServerZustand.getState().resetRegisters(type)
    }
  }, [type])

  return (
    <IconButton onClick={handleClick} size="small" color="primary">
      <DeleteFilled size={10} />
    </IconButton>
  )
})

const ServerPartTitle = meme(({ name, type }: { name: string; type: RegisterType }) => {
  const titleRef = useRef<HTMLDivElement>(null)
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
      <Box sx={{ width: 32, display: 'flex', justifyContent: 'center' }}>
        <DeleteButton type={type} />
      </Box>
      <Box sx={{ flex: 1, flexBasis: 0, textAlign: 'center' }}>{name}</Box>
      <Box sx={{ width: 32, display: 'flex', justifyContent: 'center' }}>
        <AddButton type={type} titleRef={titleRef} />
      </Box>
      <AddEdit type={type} />
    </Box>
  )
})

export default ServerPartTitle

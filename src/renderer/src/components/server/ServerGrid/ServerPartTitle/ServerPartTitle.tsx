import { DeleteFilled, PlusCircleFilled } from '@ant-design/icons'
import { alpha, Box, IconButton } from '@mui/material'
import { RegisterType } from '@shared'
import { useCallback } from 'react'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useServerZustand } from '@renderer/context/server.zustand'
import { useAddRegisterZustand } from '../ServerRegisters/addRegister.zustand'
import useServerGridZustand from '../serverGrid.zustand'

const AddButton = meme(({ type }: { type: RegisterType }) => {
  const handleClick = useCallback(() => {
    if (type === 'input_registers' || type === 'holding_registers') {
      const setRegisterType = useAddRegisterZustand.getState().setRegisterType
      setRegisterType(type)
    }
    // For bools, the inline add bar in ServerBooleans handles adding
  }, [type])

  // No add button for bool types — they have inline add
  if (type === 'coils' || type === 'discrete_inputs') return null

  return (
    <IconButton
      data-testid={`add-${type}-btn`}
      aria-label={`Add ${type.replace(/_/g, ' ')}`}
      title={`Add ${type.replace(/_/g, ' ')}`}
      onClick={handleClick}
      size="small"
      color="primary"
    >
      <PlusCircleFilled size={10} />
    </IconButton>
  )
})

const DeleteButton = meme(({ registerType }: { registerType: RegisterType }) => {
  const handleClick = useCallback(() => {
    const state = useServerZustand.getState()
    if (registerType === 'coils' || registerType === 'discrete_inputs') {
      state.resetBools(registerType)
    }
    if (registerType === 'input_registers' || registerType === 'holding_registers') {
      state.resetRegisters(registerType)
    }
  }, [registerType])

  return (
    <IconButton
      data-testid={`delete-${registerType}-btn`}
      aria-label={`Delete all ${registerType.replace(/_/g, ' ')}`}
      title={`Delete all ${registerType.replace(/_/g, ' ')}`}
      onClick={handleClick}
      size="small"
      color="primary"
    >
      <DeleteFilled size={10} />
    </IconButton>
  )
})

interface ServerPartTitleNameProps {
  name: string
  registerType: RegisterType
}
const ServerPartTitleName = meme(
  ({ name, registerType }: ServerPartTitleNameProps): JSX.Element => {
    const amount = useServerZustand((z) => {
      const uuid = z.selectedUuid
      const unitId = z.unitId[uuid]
      if (!unitId) return 0

      const amount = Object.keys(z.serverRegisters[uuid]?.[unitId]?.[registerType] ?? {}).length
      return amount
    })
    return (
      <Box
        data-testid={`section-${registerType}`}
        aria-label={`Toggle ${name} section`}
        role="button"
        sx={(theme) => ({
          flex: 1,
          flexBasis: 0,
          textAlign: 'center',
          cursor: 'pointer',
          mx: 1,
          p: 0.25,
          borderRadius: 2,
          transition: 'background-color 250ms',
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.dark, 0.2)
          }
        })}
        onClick={() => useServerGridZustand.getState().toggleCollapse(registerType)}
      >
        {name} ({amount})
      </Box>
    )
  }
)

const ServerPartTitle = meme(
  ({ name, registerType }: { name: string; registerType: RegisterType }) => {
    const collapse = useServerGridZustand((z) => z.collapse[registerType])
    const isBool = registerType === 'coils' || registerType === 'discrete_inputs'

    return (
      <Box
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
        {!collapse && (
          <Box sx={{ width: 32, display: 'flex', justifyContent: 'center' }}>
            <DeleteButton registerType={registerType} />
          </Box>
        )}
        <ServerPartTitleName name={name} registerType={registerType} />
        {!collapse && !isBool && (
          <Box sx={{ width: 32, display: 'flex', justifyContent: 'center' }}>
            <AddButton type={registerType} />
          </Box>
        )}
        {/* Bool types use inline add bar, so just a spacer for alignment */}
        {!collapse && isBool && <Box sx={{ width: 32 }} />}
      </Box>
    )
  }
)

export default ServerPartTitle

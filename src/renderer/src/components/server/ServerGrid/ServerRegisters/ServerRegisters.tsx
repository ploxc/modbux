import { Edit } from '@mui/icons-material'
import { Paper, Box, IconButton, alpha } from '@mui/material'
import { NumberRegisters, ServerRegister } from '@shared'
import { useServerZustand } from '@renderer/context/server.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAddRegisterZustand } from './addRegister.zustand'
import ServerPartTitle from '../ServerPartTitle/ServerPartTitle'
import useServerGridZustand from '../serverGrid.zustand'

interface RowProps {
  register: ServerRegister[number]
}

const RowEdit = meme(({ register }: RowProps) => {
  const handleClick = useCallback(() => {
    const state = useAddRegisterZustand.getState()
    state.setEditRegister(register)
  }, [register])

  return (
    <IconButton onClick={handleClick} size="small">
      <Edit color="primary" fontSize="small" />
    </IconButton>
  )
})

const ServerRegisterValue = ({ register }: RowProps): JSX.Element => {
  const [displayValue, setDisplayValue] = useState(register.value)

  useEffect(() => {
    const handle = setTimeout(() => {
      setDisplayValue(register.value)
    }, 10)
    return (): void => {
      clearTimeout(handle)
    }
  }, [register.value])

  return <Box sx={{ pr: 2 }}>{displayValue}</Box>
}

const ServerRegisterRow = meme(({ register }: RowProps) => {
  return (
    <Box
      sx={(theme) => ({
        width: '100%',
        height: 28,
        borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
        pl: 1,

        display: 'flex',
        alignItems: 'center',
        gap: 1,

        '&:hover': {
          backgroundColor: alpha(theme.palette.primary.dark, 0.2)
        }
      })}
    >
      {register.params.littleEndian && (
        <Box
          sx={(theme) => ({
            fontSize: 10,
            fontWeight: 'bold',
            backgroundColor: theme.palette.primary.dark,
            borderRadius: 1,
            lineHeight: 1,
            px: 0.5,
            pt: 0.5,
            pb: 0.35,
            mb: 0.2
          })}
        >
          LE
        </Box>
      )}
      <Box sx={(theme) => ({ width: 38, color: theme.palette.primary.main })}>
        {register.params.address}
      </Box>
      <Box sx={{ width: 46, opacity: 0.5, flexShrink: 0 }}>
        {register.params.dataType.replace(/_/, ' ').toUpperCase()}
      </Box>
      <ServerRegisterValue register={register} />
      <Box
        sx={{
          flex: 1,
          textAlign: 'right',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
        title={register.params.comment}
      >
        {register.params.comment}
      </Box>
      <RowEdit register={register} />
    </Box>
  )
})

const ServerRegisterRows = meme(({ type }: { type: NumberRegisters }) => {
  const registerMap = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)
    return z.serverRegisters[uuid]?.[unitId]?.[type]
  })
  const registers = useMemo(() => Object.values(registerMap ?? {}), [registerMap])

  return registers.map((register) => (
    <ServerRegisterRow
      key={`server_register_${register.params.registerType.replace(/ /gm, '_')}_${register.params.address}`}
      register={register}
    />
  ))
})

interface ServerRegistersProps {
  name: string
  type: NumberRegisters
}

const ServerRegisters = meme(({ name, type }: ServerRegistersProps) => {
  const collapse = useServerGridZustand((z) => z.collapse[type])
  const allOtherCollapsed = useServerGridZustand((z) => {
    const entries = Object.entries(z.collapse)
    const filtered = entries.filter(([k]) => k !== type)
    return filtered.every((entry) => entry[1])
  })

  return (
    <Box
      sx={{
        flex: collapse ? 0 : 1,
        minWidth: collapse ? 160 : 560,
        minHeight: collapse ? undefined : allOtherCollapsed ? '80%' : { xs: '30%', md: '48%' }
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          flex: 1,
          width: '100%',
          height: '100%',
          backgroundColor: '#2A2A2A',
          fontSize: '0.95em',
          position: 'relative'
        }}
      >
        <ServerPartTitle name={name} registerType={type} />
        <Box
          sx={{
            position: 'absolute',
            top: 38,
            left: 0,
            right: 0,
            bottom: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.9em'
          }}
        >
          {!collapse && <ServerRegisterRows type={type} />}
        </Box>
      </Paper>
    </Box>
  )
})

export default ServerRegisters

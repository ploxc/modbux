import { Edit } from '@mui/icons-material'
import { Paper, Box, IconButton, alpha } from '@mui/material'
import { NumberRegisters, ServerRegister } from '@shared'
import { useServerZustand } from '@renderer/context/server.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAddRegisterZustand } from './addRegister.zustand'
import ServerPartTitle from '../ServerPartTitle/ServerPartTitle'
import useServerGridZustand from '../serverGrid.zustand'
import { DateTime } from 'luxon'

interface RowProps {
  register: ServerRegister[number]
}

const RowEdit = meme(({ register }: RowProps) => {
  const handleClick = useCallback(() => {
    const state = useAddRegisterZustand.getState()
    state.setEditRegister(register)
  }, [register])

  return (
    <IconButton
      data-testid={`server-edit-reg-${register.params.registerType}-${register.params.address}`}
      aria-label={`Edit register ${register.params.address}`}
      title={`Edit register ${register.params.address}`}
      onClick={handleClick}
      size="small"
    >
      <Edit color="primary" fontSize="small" />
    </IconButton>
  )
})

const formatUnixValue = (seconds: number): string => {
  if (!seconds) return '—'
  return DateTime.fromSeconds(seconds).toUTC().toFormat('yyyy/MM/dd HH:mm:ss')
}

const formatDatetimeValue = (packed: number): string => {
  if (!packed) return '—'
  // Decode IEC 870-5 packed format from BigUint64 composite
  const word0 = Math.floor(packed / 2 ** 48) & 0xffff
  const word1 = Math.floor(packed / 2 ** 32) & 0xffff
  const word2 = Math.floor(packed / 2 ** 16) & 0xffff
  const word3 = packed & 0xffff
  const year = (word0 & 0x7f) + 2000
  const month = (word1 >> 8) & 0xf
  const day = word1 & 0x1f
  const hour = (word2 >> 8) & 0x1f
  const minute = word2 & 0x3f
  const second = Math.floor(word3 / 1000)
  const dt = DateTime.utc(year, month, day, hour, minute, second)
  return dt.isValid ? dt.toFormat('yyyy/MM/dd HH:mm:ss') : '—'
}

const getDisplayValue = (register: ServerRegister[number]): string | number => {
  const { dataType } = register.params
  if (dataType === 'utf8') return register.params.stringValue ?? ''
  if (dataType === 'unix') return formatUnixValue(register.value)
  if (dataType === 'datetime') return formatDatetimeValue(register.value)
  return register.value
}

const ServerRegisterValue = ({ register }: RowProps): JSX.Element => {
  const [displayValue, setDisplayValue] = useState(() => getDisplayValue(register))

  useEffect(() => {
    const handle = setTimeout(() => {
      setDisplayValue(getDisplayValue(register))
    }, 10)
    return (): void => {
      clearTimeout(handle)
    }
  }, [register.value, register.params.stringValue, register])

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
      <Box sx={(theme) => ({ width: 38, color: theme.palette.primary.main })}>
        {register.params.address}
      </Box>
      <Box sx={{ width: 60, opacity: 0.5, flexShrink: 0 }}>
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

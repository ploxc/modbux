import { Edit } from '@mui/icons-material'
import { Paper, Box, IconButton } from '@mui/material'
import { NumberRegisters, ServerRegister } from '@shared'
import { useServerZustand } from '@renderer/context/server.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useEffect, useRef } from 'react'
import { deepEqual } from 'fast-equals'
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

const ServerRegisterRow = meme(({ register }: RowProps) => {
  return (
    <Box
      sx={{
        width: '100%',
        height: 28,
        borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
        pl: 1,

        display: 'flex',
        alignItems: 'center',
        gap: 1
      }}
    >
      <Box sx={(theme) => ({ width: 38, color: theme.palette.primary.main })}>
        {register.params.address}
      </Box>
      <Box sx={{ width: 46, opacity: 0.5, flexShrink: 0 }}>
        {register.params.dataType.replace(/_/, ' ').toUpperCase()}
      </Box>
      <Box sx={{ pr: 2 }}>{register.value}</Box>
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
  const registersMemory = useRef<ServerRegister[number][]>([])
  const registers = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.unitId[uuid]
    const serverRegisters = Object.values(z.serverRegisters[uuid]?.[unitId]?.[type] || [])
    if (deepEqual(registersMemory.current, serverRegisters)) return registersMemory.current
    registersMemory.current = serverRegisters
    return serverRegisters
  })

  return registers.map((r) => (
    <ServerRegisterRow
      key={`server_register_${r.params.registerType.replace(/ /gm, '_')}_${r.params.address}`}
      register={r}
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
    console.log(type, entries, filtered)
    return filtered.every((entry) => entry[1])
  })
  useEffect(() => {
    console.log({ allOtherCollapsed, type })
  }, [allOtherCollapsed, type])

  return (
    <Box
      sx={{
        flex: collapse ? 0 : 1,
        minWidth: collapse ? 160 : 600,
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

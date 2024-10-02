import { Edit } from '@mui/icons-material'
import { Grid2, Paper, Box, IconButton, Grid2Props } from '@mui/material'
import ServerPartTitle from '../ServerPartTitle'
import { NumberRegisters } from '@shared'
import { useServerZustand } from '@renderer/context/server.zustand'
import { meme } from '@renderer/components/meme'
import { ServerRegister } from '@renderer/context/server.zustant.types'
import { useRef } from 'react'
import { deepEqual } from 'fast-equals'
import { useAddRegisterZustand } from './addRegister.zustand'

interface RowProps {
  register: ServerRegister[number]
}

const RowEdit = meme(({ register }: RowProps) => {
  const handleClick = () => {
    const state = useAddRegisterZustand.getState()
    state.setRegisterType(register.params.registerType, register)
  }

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
        {register.params.dataType.toUpperCase()}
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
    const serverRegisters = Object.values(z.serverRegisters[type])
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
  size: Grid2Props['size']
}

const ServerRegisters = ({ name, type, size }: ServerRegistersProps) => {
  return (
    <Grid2 size={size} height={{ xs: 'calc(33% - 8px)', md: 'calc(50% - 8px)', lg: '100%' }}>
      <Paper
        variant="outlined"
        sx={{
          flex: 1,
          width: '100%',
          height: '100%',
          backgroundColor: '#2A2A2A',
          fontSize: '0.95em'
        }}
      >
        <ServerPartTitle name={name} type={type} />
        <Box
          sx={{
            width: '100%',
            height: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.9em'
          }}
        >
          <ServerRegisterRows type={type} />
        </Box>
      </Paper>
    </Grid2>
  )
}

export default ServerRegisters

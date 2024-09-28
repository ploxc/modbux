import { Button, Box, Grid2, Paper } from '@mui/material'
import { useServerZustand } from '@renderer/context/server.zustand'
import { RegisterType } from '@shared'
import { deepEqual } from 'fast-equals'
import { useEffect, useRef } from 'react'
import ServerPartTitle from '../ServerPartTitle'

interface ServerBooleanProps {
  name: string
  type: RegisterType.Coils | RegisterType.DiscreteInputs
}
interface ServerBooleanButtonProps {
  address: number
  type: RegisterType.Coils | RegisterType.DiscreteInputs
}

const ServerBooleanButton = ({ address, type }: ServerBooleanButtonProps) => {
  const bool = useServerZustand((z) => z.serverRegisters[type][address])
  const setBool = useServerZustand((z) => z.setBool)

  const variant = bool ? 'contained' : 'outlined'

  useEffect(() => {
    console.log({ address, type, bool })
  }, [bool])

  return (
    <Button
      sx={{ flex: 1, flexBasis: 0 }}
      size="small"
      variant={variant}
      onClick={() => setBool(type, address, !bool)}
    >
      {address}
    </Button>
  )
}

interface ServerBooleanRowProps {
  addresses: number[]
  type: RegisterType.Coils | RegisterType.DiscreteInputs
}

const ServerBooleanRow = ({ addresses, type }: ServerBooleanRowProps) => {
  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      {addresses.map((address) => (
        <ServerBooleanButton key={`address_${type}_${address}`} address={address} type={type} />
      ))}
    </Box>
  )
}

const ServerBooleanGroups = ({ type }: Omit<ServerBooleanProps, 'name'>) => {
  const groupsMemory = useRef<number[][]>([])
  const groups = useServerZustand((z) => {
    // Split into groups of 4 adresses
    const booleans = Object.keys(z.serverRegisters[type]).map((key) => Number(key))

    let groups: number[][] = []
    for (let i = 0; i < booleans.length; i += 4) groups.push(booleans.slice(i, i + 4))

    groups = groups.map((g) => g.reverse())

    if (deepEqual(groupsMemory.current, groups)) return groupsMemory.current
    groupsMemory.current = groups
    return groups
  })

  return groups.map((adresses, i) => (
    <ServerBooleanRow key={`addresses_${type}_${i}`} addresses={adresses} type={type} />
  ))
}

const ServerBooleans = ({ name, type }: ServerBooleanProps) => {
  return (
    <Grid2
      size={{ xs: 6, md: 3.5, lg: 2.3 }}
      overflow={'auto'}
      height={{ xs: 'calc(33% - 8px)', md: 'calc(50% - 8px)', lg: '100%' }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          height: '100%',
          backgroundColor: '#2A2A2A',
          fontSize: '0.95em',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <ServerPartTitle name={name} type={type} />
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            gap: 0.5,
            flexDirection: 'column',
            p: 0.5
          }}
        >
          <ServerBooleanGroups type={type} />
        </Box>
      </Paper>
    </Grid2>
  )
}

export default ServerBooleans

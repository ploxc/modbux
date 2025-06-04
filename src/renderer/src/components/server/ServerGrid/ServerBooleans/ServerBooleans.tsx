import { Button, Box, Paper } from '@mui/material'
import { useServerZustand } from '@renderer/context/server.zustand'
import { BooleanRegisters } from '@shared'
import { deepEqual } from 'fast-equals'
import { useRef } from 'react'
import ServerPartTitle from '../ServerPartTitle/ServerPartTitle'
import { meme } from '@renderer/components/shared/inputs/meme'
import useServerGridZustand from '../serverGrid.zustand'

interface ServerBooleanProps {
  name: string
  type: BooleanRegisters
}
interface ServerBooleanButtonProps {
  address: number
  type: BooleanRegisters
}

const ServerBooleanButton = meme(({ address, type }: ServerBooleanButtonProps) => {
  const bool = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)
    return z.serverRegisters[uuid]?.[unitId]?.[type][address]
  })

  const variant = bool ? 'contained' : 'outlined'

  return (
    <Button
      sx={{ flex: 1, flexBasis: 0 }}
      size="small"
      variant={variant}
      onClick={() => useServerZustand.getState().setBool(type, address, !bool)}
    >
      {address}
    </Button>
  )
})

interface ServerBooleanRowProps {
  addresses: number[]
  type: BooleanRegisters
}

const ServerBooleanRow = meme(({ addresses, type }: ServerBooleanRowProps) => {
  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      {addresses.map((address) => (
        <ServerBooleanButton key={`address_${type}_${address}`} address={address} type={type} />
      ))}
    </Box>
  )
})

const ServerBooleanGroups = meme(({ type }: Omit<ServerBooleanProps, 'name'>) => {
  const groupsMemory = useRef<number[][]>([])
  const groups = useServerZustand((z) => {
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)

    // Split into groups of 4 adresses
    const booleans = Object.keys(z.serverRegisters[uuid]?.[unitId]?.[type] ?? []).map((key) =>
      Number(key)
    )

    const groups: number[][] = []
    for (let i = 0; i < booleans.length; i += 4) groups.push(booleans.slice(i, i + 4))

    // Reverse is like you would see it in a binary forma, but I think it's confusing
    // groups = groups.map((g) => g.reverse())

    if (deepEqual(groupsMemory.current, groups)) return groupsMemory.current
    groupsMemory.current = groups
    return groups
  })

  return groups.map((adresses, i) => (
    <ServerBooleanRow key={`addresses_${type}_${i}`} addresses={adresses} type={type} />
  ))
})

const ServerBooleans = meme(({ name, type }: ServerBooleanProps) => {
  const collapse = useServerGridZustand((z) => z.collapse[type])
  const allOtherCollapsed = useServerGridZustand((z) => {
    const entries = Object.entries(z.collapse)
    const filtered = entries.filter(([k]) => k !== type)
    return filtered.every((entry) => entry[1])
  })

  return (
    <Box
      sx={{
        flex: 0,
        minWidth: collapse ? 160 : 280,
        minHeight: collapse ? undefined : allOtherCollapsed ? '80%' : { xs: '30%', md: '48%' }
      }}
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
        <ServerPartTitle name={name} registerType={type} />
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
          {!collapse && <ServerBooleanGroups type={type} />}
        </Box>
      </Paper>
    </Box>
  )
})

export default ServerBooleans

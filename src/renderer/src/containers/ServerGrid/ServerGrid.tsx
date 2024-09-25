import { PlusCircleFilled } from '@ant-design/icons'
import { Edit } from '@mui/icons-material'
import { Box, Button, Grid2, Grid2Props, IconButton, Paper } from '@mui/material'
import { useServerZustand } from '@renderer/context/server.zustand'
import { RegisterType } from '@shared'
import { deepEqual } from 'fast-equals'
import { useCallback, useEffect, useRef } from 'react'
import AddBooleans, { useAddBooleansZustand } from './AddBoolens/AddBooleans'

interface ServerBooleanProps {
  name: string
  type: RegisterType.Coils | RegisterType.DiscreteInputs
}
interface ServerRegistersProps {
  name: string
  type: RegisterType.InputRegisters | RegisterType.HoldingRegisters
  size: Grid2Props['size']
}

//
//
//
//
// Server part title
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

//
//
//
//
// Booleans
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

//
//
//
//
// Registers
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
            <Box sx={(theme) => ({ width: 38, color: theme.palette.primary.main })}>0</Box>
            <Box sx={{ width: 46, opacity: 0.5 }}>DOUBLE</Box>
            <Box sx={{ flex: 1 }}>0.92</Box>
            <Box sx={{ flex: 1 }}>Comment</Box>
            <IconButton size="small">
              <Edit color="primary" fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </Paper>
    </Grid2>
  )
}

const ServerGrid = () => {
  return (
    <Grid2 container sx={{ height: '100%', minHeight: 0 }} spacing={2}>
      <ServerBooleans name="Coils" type={RegisterType.Coils} />
      <ServerBooleans name="Discrete Inputs" type={RegisterType.DiscreteInputs} />
      <ServerRegisters
        size={{ xs: 12, md: 5, lg: 3.7 }}
        name="Input Registers"
        type={RegisterType.InputRegisters}
      />
      <ServerRegisters
        size={{ xs: 12, md: 'grow', lg: 3.7 }}
        name="Holding Registers"
        type={RegisterType.HoldingRegisters}
      />
    </Grid2>
  )
}
export default ServerGrid

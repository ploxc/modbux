import { PlusCircleFilled } from '@ant-design/icons'
import { Edit } from '@mui/icons-material'
import { Box, Button, IconButton, Paper } from '@mui/material'
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
}

//
//
//
//
// Server part title
const ServerPartTitle = ({ name, type }: { name: string; type: RegisterType }) => {
  const handleClick = useCallback(() => {
    if (type === RegisterType.Coils || type === RegisterType.DiscreteInputs) {
      const setAddBooleansOpen = useAddBooleansZustand.getState().setOpen
      setAddBooleansOpen(true, type)
    }
  }, [type])

  return (
    <Box
      sx={(theme) => ({
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
    <Box sx={{ display: 'flex', gap: 0.5, px: 0.5 }}>
      {addresses.map((address) => (
        <ServerBooleanButton key={`address_${type}_${address}`} address={address} type={type} />
      ))}
    </Box>
  )
}

const ServerBooleans = ({ name, type }: ServerBooleanProps) => {
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

  return (
    <Paper
      variant="outlined"
      sx={{
        flex: 1,
        overflow: 'auto',
        minWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#2A2A2A',
        fontSize: '0.95em',
        gap: 0.5
      }}
    >
      <ServerPartTitle name={name} type={type} />
      {groups.map((adresses, i) => (
        <ServerBooleanRow key={`addresses_${type}_${i}`} addresses={adresses} type={type} />
      ))}
    </Paper>
  )
}

//
//
//
//
// Registers
const ServerRegisters = ({ name, type }: ServerRegistersProps) => {
  return (
    <Paper
      variant="outlined"
      sx={{
        flex: 2,
        overflow: 'auto',
        minWidth: 380,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#2A2A2A',
        fontSize: '0.95em'
      }}
    >
      <ServerPartTitle name={name} type={type} />
      <Box
        sx={{
          width: '100%',
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
  )
}

const ServerGrid = () => {
  return (
    <Box sx={{ display: 'flex', gap: 2, width: '100%', height: '100%', flexWrap: 'wrap' }}>
      <ServerBooleans name="Coils" type={RegisterType.Coils} />
      <ServerBooleans name="Discrete Inputs" type={RegisterType.DiscreteInputs} />
      <ServerRegisters name="Input Registers" type={RegisterType.InputRegisters} />
      <ServerRegisters name="Holding Registers" type={RegisterType.HoldingRegisters} />
    </Box>
  )
}
export default ServerGrid

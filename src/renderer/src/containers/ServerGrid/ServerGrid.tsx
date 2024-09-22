import { Box, Paper } from '@mui/material'

interface ServerRegistersProps {
  name: string
}
const ServerRegisters = ({ name }: ServerRegistersProps) => {
  return (
    <Paper variant="outlined" sx={{ flex: 1, overflow: 'auto', minWidth: 300 }}>
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
        <Box></Box>
        <Box>{name}</Box>
        <Box></Box>
      </Box>
    </Paper>
  )
}

const ServerGrid = () => {
  return (
    <Box sx={{ display: 'flex', gap: 2, width: '100%', height: '100%', flexWrap: 'wrap' }}>
      <ServerRegisters name="Coils" />
      <ServerRegisters name="Discrete Inputs" />
      <ServerRegisters name="Input Registers" />
      <ServerRegisters name="Holding Registers" />
    </Box>
  )
}
export default ServerGrid

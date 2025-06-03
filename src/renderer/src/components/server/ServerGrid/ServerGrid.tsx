import ServerBooleans from './ServerBooleans/ServerBooleans'
import ServerRegisters from './ServerRegisters/ServerRegisters'
import Box from '@mui/material/Box'

const ServerGrid = (): JSX.Element => {
  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <ServerBooleans name="Coils" type={'coils'} />
      <ServerBooleans name="Discrete Inputs" type={'discrete_inputs'} />
      <ServerRegisters name="Input Registers" type={'input_registers'} />
      <ServerRegisters name="Holding Registers" type={'holding_registers'} />
    </Box>
  )
}
export default ServerGrid

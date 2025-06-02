import { Grid2 } from '@mui/material'
import ServerBooleans from './ServerBooleans/ServerBooleans'
import ServerRegisters from './ServerRegisters/ServerRegisters'

const ServerGrid = (): JSX.Element => {
  return (
    <Grid2 container sx={{ height: '100%', minHeight: 0 }} spacing={2}>
      <ServerBooleans name="Coils" type={'coils'} />
      <ServerBooleans name="Discrete Inputs" type={'discrete_inputs'} />
      <ServerRegisters
        size={{ xs: 12, md: 5, lg: 3.7 }}
        name="Input Registers"
        type={'input_registers'}
      />
      <ServerRegisters
        size={{ xs: 12, md: 'grow', lg: 3.7 }}
        name="Holding Registers"
        type={'holding_registers'}
      />
    </Grid2>
  )
}
export default ServerGrid

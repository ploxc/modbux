import { Grid2 } from '@mui/material'
import { RegisterType } from '@shared'
import ServerBooleans from './ServerBooleans/ServerBooleans'
import ServerRegisters from './ServerRegisters/ServerRegisters'

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

//
//

import { TextField, Box } from '@mui/material'
import { maskInputProps } from '@renderer/components/types'
import UIntInput from '@renderer/components/UintInput'
import UnitIdInput from '@renderer/components/UnitIdInput'
import { useServerZustand } from '@renderer/context/server.zustand'

// Unit Id
const UnitId = () => {
  const unitId = useServerZustand((z) => z.unitId)
  const setUnitId = useServerZustand((z) => z.setUnitId)

  return (
    <TextField
      label="Unit ID"
      variant="outlined"
      size="small"
      sx={{ width: 80 }}
      value={unitId}
      slotProps={{
        input: {
          inputComponent: UnitIdInput as any,
          inputProps: maskInputProps({ set: setUnitId })
        }
      }}
    />
  )
}

//
//
// Port
const Port = () => {
  const port = useServerZustand((z) => z.port)
  const portValid = useServerZustand((z) => z.portValid)
  const setPort = useServerZustand((z) => z.setPort)

  return (
    <TextField
      error={!portValid}
      label="Port"
      variant="outlined"
      size="small"
      sx={{ width: 80 }}
      value={port}
      slotProps={{
        input: {
          inputComponent: UIntInput as any,
          inputProps: maskInputProps({ set: setPort })
        }
      }}
    />
  )
}

// //
// //
// // Restart
// const Restart = () => {
//   return (
//     <Button
//       onClick={() => window.api.restartServer()}
//       variant="contained"
//       color="primary"
//       size="small"
//       sx={{ width: 100 }}
//     >
//       Restart
//     </Button>
//   )
// }

//
//
// Server Config
const ServerConfig = () => {
  return (
    <Box sx={{ display: 'flex', gap: 2, ml: 'auto' }}>
      <UnitId />
      <Port />
      {/* <Restart /> */}
    </Box>
  )
}

export default ServerConfig

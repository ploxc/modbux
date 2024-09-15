import { Box } from '@mui/material'
import RegisterConfig from './containers/RegisterConfig/RegisterConfig'
import ConnectionConfig from './containers/ConnectionConfig/ConnectionConfig'
import RegisterGrid from './containers/RegisterGrid/RegisterGrid'

const App = (): JSX.Element => {
  return (
    <Box
      sx={{
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100dvh',
        width: '100dvw'
      }}
    >
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Box sx={{ display: 'flex', width: '100%', gap: 2, flexWrap: 'wrap' }}>
          <RegisterConfig />
          <ConnectionConfig />
        </Box>
      </Box>
      <RegisterGrid />
    </Box>
  )
}

export default App

import { Edit } from '@mui/icons-material'
import { Grid2, Paper, Box, IconButton, Grid2Props } from '@mui/material'
import ServerPartTitle from '../ServerPartTitle'
import { RegisterType } from '@shared'

interface ServerRegistersProps {
  name: string
  type: RegisterType.InputRegisters | RegisterType.HoldingRegisters
  size: Grid2Props['size']
}

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

export default ServerRegisters

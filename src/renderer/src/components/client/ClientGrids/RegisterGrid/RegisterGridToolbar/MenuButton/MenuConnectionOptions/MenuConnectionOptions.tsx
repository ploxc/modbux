import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Typography from '@mui/material/Typography'
import { useRootZustand } from '@renderer/context/root.zustand'

// RTU over TCP (encapsulated RTU) is a niche, TCP-family transport, so it lives
// here in the options menu rather than as a third connection toggle. Only shown
// when TCP is selected; serial RTU has no use for it.
const MenuConnectionOptions = (): JSX.Element | null => {
  const protocol = useRootZustand((z) => z.connectionConfig.protocol)
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')

  if (protocol === 'ModbusRtu') return null

  const rtuOverTcp = protocol === 'ModbusRtuOverTcp'

  return (
    <Box>
      <FormControlLabel
        disabled={disabled}
        control={
          <Checkbox
            size="small"
            checked={rtuOverTcp}
            onChange={(e) =>
              useRootZustand
                .getState()
                .setProtocol(e.target.checked ? 'ModbusRtuOverTcp' : 'ModbusTcp')
            }
            data-testid="rtu-over-tcp-checkbox"
          />
        }
        label="RTU over TCP"
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: -0.75, ml: 4, mb: 0.5 }}
      >
        For serial-to-Ethernet gateways / encapsulated RTU
      </Typography>
    </Box>
  )
}

export default MenuConnectionOptions

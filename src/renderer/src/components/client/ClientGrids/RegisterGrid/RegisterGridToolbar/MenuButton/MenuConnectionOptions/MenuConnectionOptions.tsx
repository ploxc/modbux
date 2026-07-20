import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
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
    <>
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
      <Divider sx={{ my: 1 }} />
    </>
  )
}

export default MenuConnectionOptions

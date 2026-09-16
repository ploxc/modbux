import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { ChangeEvent, useCallback } from 'react'

// RTU over TCP (encapsulated RTU) is a niche, TCP-family transport, so it lives
// here in the options menu rather than as a third connection toggle. Only shown
// when TCP is selected; serial RTU has no use for it.
const MenuConnectionOptions = meme((): JSX.Element | null => {
  const protocol = useClientZustand((z) => z.connectionConfig.protocol)
  const disabled = useClientZustand((z) => z.clientState.connectState !== 'disconnected')

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setProtocol(event.target.checked ? 'ModbusRtuOverTcp' : 'ModbusTcp')
  }, [])

  if (protocol === 'ModbusRtu') return null

  const rtuOverTcp = protocol === 'ModbusRtuOverTcp'

  return (
    <>
      <FormControlLabel
        disabled={disabled}
        control={
          <Checkbox
            size="small"
            // Warning colour here and on the TCP button, so ticking the box
            // shows you straight away which control out on the toolbar is
            // going to change.
            color="warning"
            checked={rtuOverTcp}
            onChange={handleChange}
            data-testid="rtu-over-tcp-checkbox"
          />
        }
        label="RTU over TCP"
      />
      <Divider sx={{ my: 1 }} />
    </>
  )
})

export default MenuConnectionOptions

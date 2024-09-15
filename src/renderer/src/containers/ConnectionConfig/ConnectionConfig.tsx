import { Box, Button, ToggleButton, ToggleButtonGroup } from '@mui/material'
import RtuConfig from '../RtuConfig/RtuConfig'
import TcpConfig from './TcpConfig/Tcp'
import { useRootZustand } from '@renderer/context/root.zustand'
import { Protocol } from '@shared'

// Protocol
const ProtocolSelect = ({ protocol }: { protocol: Protocol }) => {
  const setProtocol = useRootZustand((z) => z.setProtocol)

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      color="primary"
      value={protocol}
      onChange={(_, v) => setProtocol(v)}
    >
      <ToggleButton value={Protocol.ModbusTcp}>TCP</ToggleButton>
      <ToggleButton value={Protocol.ModbusRtu}>RTU</ToggleButton>
    </ToggleButtonGroup>
  )
}

const ConnectionConfig = () => {
  const protocol = useRootZustand((z) => z.connectionConfig.protocol)
  return (
    <>
      {protocol === 'ModbusTcp' ? <TcpConfig /> : <RtuConfig />}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <ProtocolSelect protocol={protocol} />
        <Button onClick={() => window.alert('TODO')}>Connect</Button>
      </Box>
    </>
  )
}
export default ConnectionConfig

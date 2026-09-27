import Cable from '@mui/icons-material/Cable'
import Lan from '@mui/icons-material/Lan'
import Router from '@mui/icons-material/Router'
import { meme } from '@renderer/components/shared/inputs/meme'
import { Protocol } from '@shared'
import { PROTOCOL_COLORS } from './clientStatus'

/** The badge a client carries for its protocol, on its card and in the rail. */
const ProtocolIcon = meme(
  ({ protocol, size = 18 }: { protocol: Protocol; size?: number }): JSX.Element => {
    const sx = { fontSize: size, color: PROTOCOL_COLORS[protocol] }
    if (protocol === 'ModbusRtu') return <Cable sx={sx} />
    if (protocol === 'ModbusRtuOverTcp') return <Router sx={sx} />
    return <Lan sx={sx} />
  }
)

export default ProtocolIcon

import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import EndianTable from '@renderer/components/shared/inputs/EndianTable'
import { useRootZustand } from '@renderer/context/root.zustand'

const ToggleEndianButton = () => {
  const type = useRootZustand((z) => z.registerConfig.type)
  const littleEndian = useRootZustand((z) => z.registerConfig.littleEndian)
  const setLittleEndian = useRootZustand((z) => z.setLittleEndian)

  const registers16Bit = ['input_registers', 'holding_registers'].includes(type)
  if (!registers16Bit) return null

  return (
    <Tooltip
      slotProps={{ tooltip: { sx: { background: 'transparent', m: 0 } } }}
      title={<EndianTable />}
      enterDelay={1000}
    >
      <ToggleButtonGroup
        sx={{ height: 29.5 }}
        size="small"
        exclusive
        color="primary"
        value={littleEndian}
        onChange={(_, v) => v !== null && setLittleEndian(v)}
      >
        <ToggleButton value={false} sx={{ whiteSpace: 'nowrap' }}>
          BE
        </ToggleButton>
        <ToggleButton value={true}>LE</ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  )
}

export default ToggleEndianButton

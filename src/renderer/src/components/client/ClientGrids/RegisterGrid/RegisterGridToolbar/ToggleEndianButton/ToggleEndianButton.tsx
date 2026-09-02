import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import EndianTable from '@renderer/components/shared/inputs/EndianTable'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'

const ToggleEndianButton = meme((): JSX.Element | null => {
  const type = useClientZustand((z) => z.registerConfig.type)
  const littleEndian = useClientZustand((z) => z.registerConfig.littleEndian)
  const setLittleEndian = useClientZustand((z) => z.setLittleEndian)

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
        <ToggleButton
          data-testid="endian-be-btn"
          aria-label="Big Endian"
          value={false}
          sx={{ whiteSpace: 'nowrap' }}
        >
          BE
        </ToggleButton>
        <ToggleButton data-testid="endian-le-btn" aria-label="Little Endian" value={true}>
          LE
        </ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  )
})

export default ToggleEndianButton

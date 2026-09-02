import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'

const MenuRegisterOptions = meme((): JSX.Element | null => {
  const type = useClientZustand((z) => z.registerConfig.type)

  const advanceMode = useClientZustand((z) => z.registerConfig.advancedMode)
  const show64BitValues = useClientZustand((z) => z.registerConfig.show64BitValues)

  const registers16Bit = ['input_registers', 'holding_registers'].includes(type)
  if (!registers16Bit) return null

  return (
    <>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={advanceMode}
            onChange={(e) => useClientZustand.getState().setAdvancedMode(e.target.checked)}
            data-testid="advanced-mode-checkbox"
          />
        }
        label="Advanced mode"
      />
      <FormControlLabel
        disabled={!advanceMode}
        control={
          <Checkbox
            size="small"
            checked={show64BitValues}
            onChange={(e) => useClientZustand.getState().setShow64BitValues(e.target.checked)}
            data-testid="show-64bit-checkbox"
          />
        }
        label="Show 64 bit values"
      />
      <Divider sx={{ my: 1 }} />
    </>
  )
})

export default MenuRegisterOptions

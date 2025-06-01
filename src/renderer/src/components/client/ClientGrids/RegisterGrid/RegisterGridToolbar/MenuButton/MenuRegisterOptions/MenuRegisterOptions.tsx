import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import { useRootZustand } from '@renderer/context/root.zustand'

const MenuRegisterOptions = () => {
  const type = useRootZustand((z) => z.registerConfig.type)
  const registers16Bit = ['input_registers', 'holding_registers'].includes(type)
  if (!registers16Bit) return null

  const advanceMode = useRootZustand((z) => z.registerConfig.advancedMode)
  const show64BitValues = useRootZustand((z) => z.registerConfig.show64BitValues)

  return (
    <>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={advanceMode}
            onChange={(e) => useRootZustand.getState().setAdvancedMode(e.target.checked)}
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
            onChange={(e) => useRootZustand.getState().setShow64BitValues(e.target.checked)}
          />
        }
        label="Show 64 bit values"
      />
    </>
  )
}

export default MenuRegisterOptions

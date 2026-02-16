import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import { useRootZustand } from '@renderer/context/root.zustand'

const MenuRegisterOptions = (): JSX.Element | null => {
  const type = useRootZustand((z) => z.registerConfig.type)

  const advanceMode = useRootZustand((z) => z.registerConfig.advancedMode)
  const show64BitValues = useRootZustand((z) => z.registerConfig.show64BitValues)
  const readLocalTime = useRootZustand((z) => z.registerConfig.readLocalTime)

  const registers16Bit = ['input_registers', 'holding_registers'].includes(type)
  if (!registers16Bit) return null

  return (
    <>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={advanceMode}
            onChange={(e) => useRootZustand.getState().setAdvancedMode(e.target.checked)}
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
            onChange={(e) => useRootZustand.getState().setShow64BitValues(e.target.checked)}
            data-testid="show-64bit-checkbox"
          />
        }
        label="Show 64 bit values"
      />
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={readLocalTime}
            onChange={(e) => useRootZustand.getState().setReadLocalTime(e.target.checked)}
            data-testid="read-local-time-checkbox"
          />
        }
        label="Read local time"
      />
    </>
  )
}

export default MenuRegisterOptions

import Button from '@mui/material/Button'
import { ButtonProps } from '@mui/material/Button'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'

const RawButton = (): JSX.Element | null => {
  const type = useRootZustand((z) => z.registerConfig.type)
  const showRawValues = useLayoutZustand((z) => z.showClientRawValues)

  if (!['input_registers', 'holding_registers'].includes(type)) return null

  const variant: ButtonProps['variant'] = showRawValues ? 'contained' : 'outlined'
  const color: ButtonProps['color'] = showRawValues ? 'warning' : 'primary'

  return (
    <Button
      data-testid="raw-btn"
      size="small"
      color={color}
      variant={variant}
      onClick={useLayoutZustand.getState().toggleShowClientRawValues}
    >
      RAW
    </Button>
  )
}

export default RawButton

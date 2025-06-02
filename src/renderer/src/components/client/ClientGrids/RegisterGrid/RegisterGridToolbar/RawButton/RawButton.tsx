import Button from '@mui/material/Button'
import { ButtonProps } from '@mui/material/Button'
import { useLayoutZustand } from '@renderer/context/layout.zustand'

const RawButton = () => {
  const showRawValues = useLayoutZustand((z) => z.showClientRawValues)

  const variant: ButtonProps['variant'] = showRawValues ? 'contained' : 'outlined'
  const color: ButtonProps['color'] = showRawValues ? 'warning' : 'primary'

  return (
    <Button
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

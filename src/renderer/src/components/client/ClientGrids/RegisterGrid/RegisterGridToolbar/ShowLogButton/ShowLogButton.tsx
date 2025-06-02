import Button, { ButtonProps } from '@mui/material/Button'
import { useLayoutZustand } from '@renderer/context/layout.zustand'

const ShowLogButton = (): JSX.Element => {
  const showLog = useLayoutZustand((z) => z.showLog)
  const toggleShowLog = useLayoutZustand((z) => z.toggleShowLog)

  const variant: ButtonProps['variant'] = showLog ? 'contained' : 'outlined'
  const text = showLog ? 'Hide Log' : 'Show Log'

  return (
    <Button size="small" variant={variant} onClick={toggleShowLog}>
      {text}
    </Button>
  )
}

export default ShowLogButton

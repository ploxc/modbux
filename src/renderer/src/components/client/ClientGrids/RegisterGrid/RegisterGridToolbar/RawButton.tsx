import Button from '@mui/material/Button'
import { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { openTypesOf, useClientZustand } from '@renderer/context/client.zustand'
import { useCallback } from 'react'
import { isNumberRegister } from '@shared'

/**
 * The switch between a register's raw value and its converted one, which Debug
 * and Monitor share.
 */
export const RawToggle = meme(({ testId }: { testId: string }): JSX.Element => {
  const showRawValues = useLayoutZustand((z) => z.showClientRawValues)

  const handleClick = useCallback((): void => {
    const layoutZustand = useLayoutZustand.getState()
    layoutZustand.toggleShowClientRawValues()
  }, [])

  const variant: ButtonProps['variant'] = showRawValues ? 'contained' : 'outlined'
  const color: ButtonProps['color'] = showRawValues ? 'warning' : 'primary'

  return (
    <Button data-testid={testId} size="small" color={color} variant={variant} onClick={handleClick}>
      RAW
    </Button>
  )
})

const RawButton = meme((): JSX.Element | null => {
  // It sets every open register panel of the unit, so it shows while any is open.
  const anyRegisters = useClientZustand((z) => openTypesOf(z).some(isNumberRegister))
  return anyRegisters ? <RawToggle testId="raw-btn" /> : null
})

export default RawButton

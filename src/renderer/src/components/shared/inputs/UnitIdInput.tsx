import { IMaskInput } from 'react-imask'
import { forwardRef } from 'react'
import { integerMask } from './integerMask'
import { meme } from './meme'
import { MaskInputProps } from './types'

const UnitIdInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      {...integerMask}
      min={0}
      max={255}
      autofix
      inputRef={ref}
      onAccept={(value) => set(value, true)}
    />
  )
})

UnitIdInputForward.displayName = 'UnitIdInput'

const UnitIdInput = meme(UnitIdInputForward)

export default UnitIdInput

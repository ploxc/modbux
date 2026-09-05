import { IMaskInput } from 'react-imask'
import { forwardRef } from 'react'
import { integerMask } from './integerMask'
import { meme } from './meme'
import { MaskInputProps } from './types'

const UIntInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, max = 65535, ...other } = props
  return (
    <IMaskInput
      {...other}
      {...integerMask}
      autofix
      min={0}
      max={max}
      inputRef={ref}
      onAccept={(value: string) => set(value, value.length > 0)}
    />
  )
})

UIntInputForward.displayName = 'UIntInput'

const UIntInput = meme(UIntInputForward)

export default UIntInput

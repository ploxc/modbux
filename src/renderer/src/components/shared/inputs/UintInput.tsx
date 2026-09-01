import { IMaskInput, IMask } from 'react-imask'
import { forwardRef } from 'react'
import { meme } from './meme'
import { MaskInputProps } from './types'

const UIntInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, max = 65535, ...other } = props
  return (
    <IMaskInput
      {...other}
      autofix
      mask={IMask.MaskedNumber}
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

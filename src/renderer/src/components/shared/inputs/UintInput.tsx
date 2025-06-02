import { IMaskInput, IMask } from 'react-imask'
import { forwardRef } from 'react'
import { MaskInputProps } from './types'

const UIntInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      autofix
      mask={IMask.MaskedNumber}
      min={0}
      max={65535}
      inputRef={ref}
      onAccept={(value: string) => set(value, value.length > 0)}
    />
  )
})

UIntInput.displayName = 'UIntInput'

export default UIntInput

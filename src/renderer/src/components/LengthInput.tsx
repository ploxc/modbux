import { IMaskInput, IMask } from 'react-imask'
import { forwardRef } from 'react'
import { MaskInputProps } from './types'

const LengthInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      autofix
      min={0}
      max={125}
      inputRef={ref}
      onAccept={(value: any) => set(value, value > 0)}
    />
  )
})

export default LengthInput

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
      onAccept={(value) => set(value, Number(value) > 0)}
    />
  )
})

LengthInput.displayName = 'LengthInput'

export default LengthInput

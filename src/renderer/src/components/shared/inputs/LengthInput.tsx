import { IMaskInput, IMask } from 'react-imask'
import { forwardRef } from 'react'
import { MaskInputProps } from './types'

const LengthInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, max = 125, ...other } = props
  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      autofix
      min={0}
      max={Math.min(125, max)}
      inputRef={ref}
      onAccept={(value) => set(value, Number(value) > 0)}
    />
  )
})

LengthInput.displayName = 'LengthInput'

export default LengthInput

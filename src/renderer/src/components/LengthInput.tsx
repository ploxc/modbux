import { IMaskInput, IMask } from 'react-imask'
import { forwardRef } from 'react'
import { MaskInputProps } from './types'

const LengthInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      autofix
      mask={IMask.MaskedNumber}
      min={1}
      max={100}
      inputRef={ref}
      onAccept={(value: any) => set(value, true)}
      overwrite
    />
  )
})

export default LengthInput

import { IMaskInput, IMask } from 'react-imask'
import { forwardRef } from 'react'
import { MaskInputProps } from './types'

const UIntInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      autofix
      mask={IMask.MaskedRange}
      from={0}
      to={65535}
      minLength={1}
      maxLength={5}
      inputRef={ref}
      onAccept={(value: any) => set(value, true)}
      overwrite
    />
  )
})

export default UIntInput

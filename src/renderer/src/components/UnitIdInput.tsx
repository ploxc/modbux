import { IMaskInput, IMask } from 'react-imask'
import { forwardRef } from 'react'
import { MaskInputProps } from './types'

const UnitIdInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={0}
      max={247}
      autofix
      inputRef={ref}
      onAccept={(value: any) => set(value, true)}
      overwrite
    />
  )
})

export default UnitIdInput

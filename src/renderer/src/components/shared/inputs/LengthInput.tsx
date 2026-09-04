import { IMaskInput, IMask } from 'react-imask'
import { forwardRef } from 'react'
import { meme } from './meme'
import { MaskInputProps } from './types'

const LengthInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
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

LengthInputForward.displayName = 'LengthInput'

const LengthInput = meme(LengthInputForward)

export default LengthInput

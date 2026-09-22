import { IMaskInput } from 'react-imask'
import { forwardRef } from 'react'
import { integerMask } from './integerMask'
import { meme } from './meme'
import { MaskInputProps } from './types'
import { isReadLengthGiven, MAX_READ_REGISTERS } from '@shared'

/**
 * The length of a read, bounded by the caller.
 *
 * The ceiling was `Math.min(125, max)`, so the `max` a caller passed could only
 * lower it and a coil read was held to 125 of the 2000 FC01 answers. What one
 * read can carry is `maxReadQuantity`, by register type, and how much is there
 * is `registersFrom`. The caller knows both.
 */
const LengthInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, max = MAX_READ_REGISTERS, ...other } = props
  return (
    <IMaskInput
      {...other}
      {...integerMask}
      autofix
      min={0}
      max={max}
      inputRef={ref}
      onAccept={(value) => set(value, isReadLengthGiven(Number(value)))}
    />
  )
})

LengthInputForward.displayName = 'LengthInput'

const LengthInput = meme(LengthInputForward)

export default LengthInput

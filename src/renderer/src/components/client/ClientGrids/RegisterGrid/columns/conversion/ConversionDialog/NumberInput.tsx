import { decimalMask } from '@renderer/components/shared/inputs/decimalMask'
import { meme } from '@renderer/components/shared/inputs/meme'
import { MaskInputProps } from '@renderer/components/shared/inputs/types'
import { forwardRef } from 'react'
import { IMaskInput } from 'react-imask'

export interface NumberInputProps extends MaskInputProps {
  integer?: boolean
  min?: number
}

/**
 * A field of the dialog that takes a number and nothing else. Given `min` and
 * `max` it clamps to them; a raw point gets neither, because a point outside
 * the data type's range is marked red rather than rewritten.
 */
const NumberInputForward = forwardRef<HTMLInputElement, NumberInputProps>((props, ref) => {
  const { set, integer = false, min, max, ...other } = props
  const bounded = min !== undefined && max !== undefined

  return (
    <IMaskInput
      {...other}
      {...decimalMask(integer)}
      {...(bounded ? { min, max, autofix: true } : {})}
      inputRef={ref}
      onAccept={(value) => set(value)}
    />
  )
})

NumberInputForward.displayName = 'NumberInput'

export const NumberInput = meme(NumberInputForward)

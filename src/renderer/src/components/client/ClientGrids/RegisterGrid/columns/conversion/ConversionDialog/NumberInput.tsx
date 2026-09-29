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
 * Any number as JavaScript writes one, a half-typed one included: a sign,
 * digits, one point and an exponent. A pattern rather than
 * `IMask.MaskedNumber`, which keeps seven decimals and no exponent, and would
 * rewrite `1e-7` to `17` on mount.
 */
const NUMBER_TEXT = /^-?\d*\.?\d*(e[-+]?\d*)?$/i

/** A comma typed as the decimal point, as `decimalMask` maps one. */
const commaAsPoint = (char: string): string => (char === ',' ? '.' : char)

/**
 * A field of the dialog that takes a number and nothing else. Given `min` and
 * `max` it is `decimalMask` clamped to them. Without, it keeps a stored value
 * whole, because the mask hands its setter the value it mounts with and
 * anything it rewrote would be saved rewritten.
 */
const NumberInputForward = forwardRef<HTMLInputElement, NumberInputProps>((props, ref) => {
  const { set, integer = false, min, max, ...other } = props
  const bounded = min !== undefined && max !== undefined

  return (
    <IMaskInput
      {...other}
      {...(bounded
        ? { ...decimalMask(integer), min, max, autofix: true }
        : { mask: NUMBER_TEXT, prepareChar: commaAsPoint })}
      inputRef={ref}
      onAccept={(value) => set(value)}
    />
  )
})

NumberInputForward.displayName = 'NumberInput'

export const NumberInput = meme(NumberInputForward)

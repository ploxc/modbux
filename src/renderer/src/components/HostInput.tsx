import { IMaskInput, IMask } from 'react-imask'
import { forwardRef } from 'react'
import { MaskInputProps } from './types'

const HostInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      mask="IP.IP.IP.IP"
      blocks={{
        IP: {
          mask: IMask.MaskedNumber,
          min: 0,
          max: 255,
          scale: 0
        }
      }}
      inputRef={ref}
      prepare={(char, mask) => {
        // Only accept numbers and dots.
        // When entering an invalid character it would fill the input with the remaining dots
        // without any numbers inbetween the dots.
        const isValidChar = /[\d\.]/.test(char)
        if (!isValidChar) return ''

        // No number can lead with a zero
        // not 00.04.012.001
        // but 0.4.12.1
        const parts = mask.displayValue.split('.')
        const lastPart = parts.at(-1)
        if (lastPart && lastPart.length === 1 && lastPart === '0') {
          return parts.length < 4 ? `.${char}` : ''
        }

        return char
      }}
      onAccept={(value) => {
        set(value, /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(value))
      }}
    />
  )
})

export default HostInput

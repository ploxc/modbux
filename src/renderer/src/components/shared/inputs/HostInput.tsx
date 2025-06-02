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
        // // Only accept numbers and dots.
        // // When entering an invalid character it would fill the input with the remaining dots
        // // without any numbers inbetween the dots.
        // const isValidChar = /[\d\.]/.test(char)
        // if (!isValidChar) return ''

        // // No number can lead with a zero
        // // not 00.04.012.001
        // // but 0.4.12.1
        // const parts = mask.displayValue.split('.')
        // const lastPart = parts.at(-1)
        // if (lastPart && lastPart.length === 1 && lastPart === '0') {
        //   return parts.length < 4 ? `.${char}` : ''
        // }

        // return char

        // !

        // Allow only digits and dots
        const isValidChar = /[\d.]/.test(char)
        if (!isValidChar) return ''

        const value = mask.value

        // Prevent double dots: if the last character is already a dot, ignore a second dot
        if (char === '.' && value.endsWith('.')) {
          return ''
        }

        // Split the current value into IP segments
        const parts = value.split('.')

        // Prevent entering more than 3 dots (IPv4 has 4 parts = 3 dots)
        const dotCount = (value.match(/\./g) || []).length
        if (char === '.' && dotCount >= 3) {
          return ''
        }

        // Allow typing '0' as a single segment, like in "0.0.0.0"
        // But prevent situations like "00.123.001.1"
        const lastPart = parts[parts.length - 1]

        if (lastPart === '0' && char !== '.') {
          // Prevent adding extra digits after a leading zero
          // Only allow the dot to close the segment
          return ''
        }

        // All other cases: allow the character
        return char
      }}
      onAccept={(value) => {
        set(value, /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(value))
      }}
    />
  )
})

HostInput.displayName = 'HostInput'

export default HostInput

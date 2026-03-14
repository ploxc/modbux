import { forwardRef } from 'react'
import { MaskInputProps } from './types'

const HostInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <input
      {...other}
      ref={ref}
      onChange={(e) => {
        const value = e.target.value
        set(value, value.trim().length > 0)
      }}
    />
  )
})

HostInput.displayName = 'HostInput'

export default HostInput

import { forwardRef } from 'react'
import { meme } from './meme'
import { MaskInputProps } from './types'

const HostInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
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

HostInputForward.displayName = 'HostInput'

const HostInput = meme(HostInputForward)

export default HostInput

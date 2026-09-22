import { isConnectionAddressGiven } from '@shared'
import { forwardRef, InputHTMLAttributes, useCallback, useEffect, useRef, useState } from 'react'
import { meme } from './meme'
import { MaskInputProps } from './types'

type HostInputProps = MaskInputProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value?: unknown }

/**
 * The host field, holding its own text while it has focus.
 *
 * `setHost` writes the store only once main has answered, so a field reading
 * its value from the store has it written from outside after the key, and Cmd+Z
 * in it did nothing. Held here, the field keeps its own undo history. The
 * store's value reaches the field while it has no focus, and on blur, so a
 * store that lags behind the typing never overwrites it.
 */
const HostInputForward = forwardRef<HTMLInputElement, HostInputProps>((props, ref) => {
  const { set, value, ...other } = props
  const storeText = String(value ?? '')
  const [text, setText] = useState(storeText)
  const input = useRef<HTMLInputElement | null>(null)

  const attach = useCallback(
    (element: HTMLInputElement | null) => {
      input.current = element
      if (typeof ref === 'function') ref(element)
      else if (ref) ref.current = element
    },
    [ref]
  )

  useEffect(() => {
    if (document.activeElement !== input.current) setText(storeText)
  }, [storeText])

  return (
    <input
      {...other}
      ref={attach}
      value={text}
      onChange={(e) => {
        const typed = e.target.value
        setText(typed)
        set(typed, isConnectionAddressGiven(typed))
      }}
      onBlur={(e) => {
        setText(storeText)
        other.onBlur?.(e)
      }}
    />
  )
})

HostInputForward.displayName = 'HostInput'

const HostInput = meme(HostInputForward)

export default HostInput

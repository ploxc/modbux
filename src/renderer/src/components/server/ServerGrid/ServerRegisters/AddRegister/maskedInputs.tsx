/**
 * The six masked inputs, each an IMask wrapper behind a forwardRef.
 *
 * Six near-identical pairs, which is why they sit together: whatever is done
 * to one of them should be done to all six, and that is easier to see here
 * than spread through the dialog.
 */
import { useAddRegisterZustand } from './addRegister.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { MaskInputProps } from '@renderer/components/shared/inputs/types'
import { forwardRef } from 'react'
import { IMask, IMaskInput } from 'react-imask'
import { notEmpty } from '@shared'
import { useMinMaxInteger } from '@renderer/hooks'

const AddressInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props

  // Set maximum address based on data type
  const maxAddress = useAddRegisterZustand((z) => {
    if (['int32', 'uint32', 'float', 'unix'].includes(z.dataType)) return 65534
    if (['int64', 'uint64', 'double', 'datetime'].includes(z.dataType)) return 65532
    if (z.dataType === 'utf8') return Math.max(0, 65535 - (Number(z.registerLength) || 10) + 1)
    return 65535
  })

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={0}
      max={maxAddress}
      autofix
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

AddressInputForward.displayName = 'AddressInput'

export const AddressInput = meme(AddressInputForward)

const ValueInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const dataType = useAddRegisterZustand((z) => z.dataType)
  const { min, max, integer } = useMinMaxInteger(dataType)

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={min}
      max={max}
      autofix
      {...{
        scale: integer ? 0 : 7,
        thousandsSeparator: '',
        radix: '.', // fractional delimiter
        mapToRadix: ['.', ','] // symbols to process as radix
      }}
      inputRef={ref}
      onAccept={(value) => {
        set(value, notEmpty(value))
      }}
    />
  )
})

ValueInputForward.displayName = 'ValueInput'

export const ValueInput = meme(ValueInputForward)

const MinInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const dataType = useAddRegisterZustand((z) => z.dataType)
  const maxValue = useAddRegisterZustand((z) => z.max)
  const { min, max, integer } = useMinMaxInteger(dataType, 'min', maxValue)

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={min}
      max={max}
      autofix
      {...{
        scale: integer ? 0 : 7,
        thousandsSeparator: '',
        radix: '.', // fractional delimiter
        mapToRadix: ['.', ','] // symbols to process as radix
      }}
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

MinInputForward.displayName = 'MinInput'

export const MinInput = meme(MinInputForward)

const MaxInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const dataType = useAddRegisterZustand((z) => z.dataType)
  const minValue = useAddRegisterZustand((z) => z.min)
  const { min, integer, max } = useMinMaxInteger(dataType, 'max', minValue)

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={min}
      max={max}
      autofix
      {...{
        scale: integer ? 0 : 7,
        thousandsSeparator: '',
        radix: '.', // fractional delimiter
        mapToRadix: ['.', ','] // symbols to process as radix
      }}
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

MaxInputForward.displayName = 'MaxInput'

export const MaxInput = meme(MaxInputForward)

//
//
// Interval

const IntervalInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={1}
      max={10}
      autofix
      {...{
        scale: 0,
        thousandsSeparator: ''
      }}
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

IntervalInputForward.displayName = 'IntervalInput'

export const IntervalInput = meme(IntervalInputForward)

const RegisterLengthForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={1}
      max={124}
      autofix
      scale={0}
      thousandsSeparator=""
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

RegisterLengthForward.displayName = 'RegisterLengthInput'

export const RegisterLengthInput = meme(RegisterLengthForward)

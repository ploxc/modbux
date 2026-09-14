/**
 * What value the register produces: a fixed one, or a generator.
 *
 * The fields swap with the data type, so the nine of them are one subject.
 */
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useAddRegisterZustand } from './addRegister.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import { DataType, getMinMaxValues } from '@shared'
import { ChangeEvent, ElementType, useCallback, useEffect, useMemo } from 'react'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon'
import { DateTime } from 'luxon'
import { ValueInput, MinInput, MaxInput, IntervalInput, RegisterLengthInput } from './maskedInputs'

export const FixedOrGenerator = meme(() => {
  const fixed = useAddRegisterZustand((z) => z.fixed)
  const dataType = useAddRegisterZustand((z) => z.dataType)

  const handleChange = useCallback((_event: unknown, value: boolean | null): void => {
    if (value === null) return
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.setFixed(value)
  }, [])

  // UTF-8 and BITMAP are always fixed — hide toggle
  if (dataType === 'utf8' || dataType === 'bitmap') return null

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      color="primary"
      value={fixed}
      onChange={handleChange}
      sx={{ flex: 1 }}
    >
      <ToggleButton data-testid="add-reg-fixed-btn" sx={{ flex: 1, flexBasis: 0 }} value={true}>
        Fixed
      </ToggleButton>
      <ToggleButton
        data-testid="add-reg-generator-btn"
        sx={{ flex: 1, flexBasis: 0 }}
        value={false}
      >
        Generator
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

//
//
//
//
// Value Input

const ValueInputComponent = meme(() => {
  const value = useAddRegisterZustand((z) => z.value)
  const valid = useAddRegisterZustand((z) => z.valid.value)

  const setValue = useAddRegisterZustand.getState().setValue

  return (
    <TextField
      data-testid="add-reg-value-input"
      label="Value"
      variant="outlined"
      size="small"
      sx={{ minWidth: 100 }}
      value={value}
      error={!valid}
      slotProps={{
        input: {
          inputComponent: ValueInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setValue })
        }
      }}
    />
  )
})

//
//
//
//
// Min/Max Masks

const MinTextField = meme(() => {
  const min = useAddRegisterZustand((z) => String(z.min))
  const valid = useAddRegisterZustand((z) => z.valid.min)

  const setMin = useAddRegisterZustand.getState().setMin

  return (
    <TextField
      data-testid="add-reg-min-input"
      error={!valid}
      label="Min Value"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={min}
      slotProps={{
        input: {
          inputComponent: MinInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setMin })
        }
      }}
    />
  )
})

const MaxTextField = meme(() => {
  const max = useAddRegisterZustand((z) => String(z.max))
  const valid = useAddRegisterZustand((z) => z.valid.max)

  const setMax = useAddRegisterZustand.getState().setMax

  return (
    <TextField
      data-testid="add-reg-max-input"
      error={!valid}
      label="Max Value"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={max}
      slotProps={{
        input: {
          inputComponent: MaxInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setMax })
        }
      }}
    />
  )
})

//
//
//
//
// Interval

const IntervalTextField = meme(() => {
  const interval = useAddRegisterZustand((z) => String(z.interval))
  const valid = useAddRegisterZustand((z) => z.valid.interval)

  const setInterval = useAddRegisterZustand.getState().setInterval

  return (
    <TextField
      data-testid="add-reg-interval-input"
      error={!valid}
      label="Interval (s)"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={interval}
      slotProps={{
        input: {
          inputComponent: IntervalInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setInterval })
        }
      }}
    />
  )
})

//
//
//
//
// DateTimePicker for unix/datetime fixed mode

/**
 * The window the picker offers, as the milliseconds it works in.
 *
 * `getMinMaxValues` answers in the unit the register stores, which
 * `toRegisterParams` splits: seconds for `unix`, milliseconds for `datetime`.
 * Without a window the picker took any year it could render, and neither writer
 * refuses one: `encodeIEC870DateTime` clamps 2200 to the end of 2127, and
 * `createRegisters`' `value >>> 0` wraps 2200 into 2063/11/24 17:31:44.
 */
const pickerWindow = (dataType: DataType): { minDate: DateTime; maxDate: DateTime } => {
  const { min, max } = getMinMaxValues(dataType)
  const toMilliseconds = dataType === 'unix' ? 1000 : 1

  return {
    minDate: DateTime.fromMillis(min * toMilliseconds),
    maxDate: DateTime.fromMillis(max * toMilliseconds)
  }
}

const DateTimeField = meme(() => {
  const value = useAddRegisterZustand((z) => z.value)
  const dataType = useAddRegisterZustand((z) => z.dataType)
  const showDatePickerUtc = useAddRegisterZustand((z) => z.showDatePickerUtc)

  const { minDate, maxDate } = useMemo(() => pickerWindow(dataType), [dataType])

  const handleChange = useCallback(
    (dt: DateTime | null): void => {
      if (!dt || !dt.isValid) return
      const addRegisterZustand = useAddRegisterZustand.getState()

      const milliseconds = dt.toMillis()
      const inWindow = milliseconds >= minDate.toMillis() && milliseconds <= maxDate.toMillis()
      addRegisterZustand.setValue(String(milliseconds), inWindow)
    },
    [minDate, maxDate]
  )

  const handleUtcChange = useCallback((): void => {
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.setShowDatePickerUtc(!addRegisterZustand.showDatePickerUtc)
  }, [])

  const dateValue = value && value !== '0' ? DateTime.fromMillis(Number(value)) : DateTime.now()

  return (
    <LocalizationProvider dateAdapter={AdapterLuxon}>
      <DateTimePicker
        timezone={showDatePickerUtc ? 'UTC' : undefined}
        label="Date & Time"
        value={dateValue}
        onChange={handleChange}
        minDate={minDate}
        maxDate={maxDate}
        ampm={false}
        slotProps={{
          textField: {
            size: 'small',
            sx: { minWidth: 220 },
            // v9 renders a PickersTextField here, not a Material TextField, so
            // the html input is reached through its own nested slotProps.
            slotProps: { htmlInput: { 'data-testid': 'add-reg-datetime-input' } }
          }
        }}
      />
      <ToggleButtonGroup size="small" value={showDatePickerUtc} color="primary">
        <ToggleButton
          value={true}
          data-testid="add-reg-datetime-show-utc"
          aria-label="Show UTC time for datepicker"
          title="Toggle UTC/local display — register is always encoded in UTC"
          onChange={handleUtcChange}
        >
          UTC
        </ToggleButton>
      </ToggleButtonGroup>
    </LocalizationProvider>
  )
})

//
//
//
//
// String value input for utf8

const StringValueField = meme(() => {
  const stringValue = useAddRegisterZustand((z) => z.stringValue)
  const maxBytes = useAddRegisterZustand((z) => (Number(z.registerLength) || 10) * 2)
  const valid = useAddRegisterZustand((z) => z.valid.stringValue)

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.setStringValue(event.target.value)
  }, [])

  useEffect(() => {
    // Reevaluate string length when changing register Length
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.setStringValue(addRegisterZustand.stringValue)
  }, [maxBytes])

  const helperText = `${new TextEncoder().encode(stringValue).length} / ${maxBytes} bytes`

  return (
    <TextField
      data-testid="add-reg-string-input"
      label="String Value"
      variant="outlined"
      size="small"
      sx={{ minWidth: 200, flex: 1 }}
      value={stringValue}
      onChange={handleChange}
      helperText={helperText}
      error={!valid}
    />
  )
})

//
//
//
//
// Register length input for utf8

const RegisterLengthField = meme(() => {
  const registerLength = useAddRegisterZustand((z) => z.registerLength)
  const valid = useAddRegisterZustand((z) => z.valid.registerLength)

  const setRegisterLength = useAddRegisterZustand.getState().setRegisterLength

  return (
    <TextField
      data-testid="add-reg-length-input"
      error={!valid}
      label="Registers"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={registerLength}
      slotProps={{
        input: {
          inputComponent: RegisterLengthInput as unknown as ElementType<
            InputBaseComponentProps,
            'input'
          >,
          inputProps: maskInputProps({ set: setRegisterLength })
        }
      }}
    />
  )
})

//
//
//
//
// ValueParameters

export const ValueParameters = meme(() => {
  const fixed = useAddRegisterZustand((z) => z.fixed)
  const dataType = useAddRegisterZustand((z) => z.dataType)

  // UTF-8: string input + register length
  if (dataType === 'utf8') {
    return (
      <>
        <StringValueField />
        <RegisterLengthField />
      </>
    )
  }

  // Unix/datetime fixed: date picker
  if (['unix', 'datetime'].includes(dataType) && fixed) {
    return <DateTimeField />
  }

  // Unix/datetime generator: only interval
  if (['unix', 'datetime'].includes(dataType) && !fixed) {
    return <IntervalTextField />
  }

  // Numeric fixed: value input
  if (fixed) {
    return <ValueInputComponent />
  }

  // Numeric generator: min/max/interval
  return (
    <>
      <MinTextField />
      <MaxTextField />
      <IntervalTextField />
    </>
  )
})

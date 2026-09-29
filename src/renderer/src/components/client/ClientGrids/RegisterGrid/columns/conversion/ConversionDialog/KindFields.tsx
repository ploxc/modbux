import Box from '@mui/material/Box'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import { meme } from '@renderer/components/shared/inputs/meme'
import { DataType, getMinMaxValues } from '@shared'
import { ElementType, useCallback } from 'react'
import { isNumber, LERP_FIELDS, LerpKey, outsideRaw } from './draft'
import { NumberInput } from './NumberInput'

const numberInput = NumberInput as unknown as ElementType<InputBaseComponentProps, 'input'>

/** What None says: nothing is done to the value. */
export const NoneNote = meme(() => (
  <Box sx={{ p: 2, fontSize: 13, color: 'text.secondary' }}>
    The value as its data type reads it.
  </Box>
))

interface ScaleFieldProps {
  factorText: string
  set: (text: string) => void
}

/** Scale's one field, the factor, kept as typed so a half-typed number stays. */
export const ScaleField = meme(({ factorText, set }: ScaleFieldProps) => (
  <Box sx={{ p: 2 }}>
    <TextField
      label="Factor"
      size="medium"
      value={factorText}
      error={!isNumber(factorText)}
      slotProps={{
        input: { inputComponent: numberInput },
        htmlInput: { 'data-testid': 'conversion-factor-input', set }
      }}
      sx={{ width: 140 }}
    />
  </Box>
))

interface LerpFieldProps {
  field: LerpKey
  label: string
  value: string
  dataType: DataType | undefined
  set: (key: LerpKey, text: string) => void
}

/**
 * One field of the interpolation. A raw point outside what the data type reads
 * is marked red and names the range, and the dialog refuses to save it.
 */
const LerpField = meme(({ field, label, value, dataType, set }: LerpFieldProps) => {
  const handleSet = useCallback((text: string) => set(field, text), [field, set])
  const raw = field === 'x1' || field === 'x2'
  const outside = raw && outsideRaw(value, dataType)
  const range = dataType && getMinMaxValues(dataType)

  return (
    <TextField
      label={label}
      size="medium"
      value={value}
      error={!isNumber(value) || outside}
      helperText={outside && range ? `${range.min} to ${range.max}` : undefined}
      slotProps={{
        input: { inputComponent: numberInput },
        htmlInput: {
          'data-testid': `conversion-${field}-input`,
          set: handleSet
        }
      }}
    />
  )
})

interface LerpFieldsProps {
  x1: string
  x2: string
  y1: string
  y2: string
  dataType: DataType | undefined
  set: (key: LerpKey, text: string) => void
}

/** Linear interpolation's four fields: two raw points and the values they map to. */
export const LerpFields = meme(({ dataType, set, ...values }: LerpFieldsProps) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 1.25,
      p: 2,
      alignContent: 'start'
    }}
  >
    {LERP_FIELDS.map(([key, label]) => (
      <LerpField
        key={key}
        field={key}
        label={label}
        value={values[key]}
        dataType={dataType}
        set={set}
      />
    ))}
  </Box>
))

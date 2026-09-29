import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import { meme } from '@renderer/components/shared/inputs/meme'
import { ChangeEvent } from 'react'
import { isNumber, LERP_FIELDS } from './draft'

/** What None says: nothing is done to the value. */
export const NoneNote = meme(() => (
  <Box sx={{ p: 2, fontSize: 13, color: 'text.secondary' }}>
    The value as its data type reads it.
  </Box>
))

interface ScaleFieldProps {
  factorText: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

/** Scale's one field, the factor, kept as typed so a half-typed number stays. */
export const ScaleField = meme(({ factorText, onChange }: ScaleFieldProps) => (
  <Box sx={{ p: 2 }}>
    <TextField
      label="Factor"
      size="medium"
      value={factorText}
      onChange={onChange}
      error={!isNumber(factorText)}
      slotProps={{ htmlInput: { 'data-testid': 'conversion-factor-input' } }}
      sx={{ width: 140 }}
    />
  </Box>
))

interface LerpFieldsProps {
  x1: string
  x2: string
  y1: string
  y2: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

/** Linear interpolation's four fields: two raw points and the values they map to. */
export const LerpFields = meme(({ onChange, ...values }: LerpFieldsProps) => (
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
      <TextField
        key={key}
        name={key}
        label={label}
        size="medium"
        value={values[key]}
        onChange={onChange}
        error={!isNumber(values[key])}
        slotProps={{ htmlInput: { 'data-testid': `conversion-${key}-input` } }}
      />
    ))}
  </Box>
))

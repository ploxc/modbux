import {
  AutocompleteRenderInputParams,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField
} from '@mui/material'
import { meme } from './meme'
import { ModbusBaudRate, ModbusBaudRateSchema } from '@shared'
import React, { useMemo } from 'react'

export const measureTextWidth = (
  text: string,
  font: string = '400 0.85rem Roboto, sans-serif'
): number => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context) {
    context.font = font
    return context.measureText(text).width
  }
  return 0
}

export const useComInputWidth = (ports: { path: string }[]): number =>
  useMemo(() => {
    let textWidth = 60
    for (const port of ports) {
      const newTextWidth = measureTextWidth(port.path || 'COM Port')
      if (newTextWidth > textWidth) textWidth = newTextWidth
    }
    return Math.max(60, textWidth + 60)
  }, [ports])

export const ComTextField = meme(
  (
    params: AutocompleteRenderInputParams & {
      comLabel: string
      comError: boolean
      comLoading: boolean
    }
  ) => {
    const { comLabel, comError, comLoading, ...rest } = params

    return (
      <TextField
        {...rest}
        label={comLabel}
        variant="outlined"
        size="small"
        title={rest.inputProps.value as string}
        error={comError}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0
          },
          '& .MuiOutlinedInput-input': {
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }
        }}
        slotProps={{
          input: {
            ...rest.InputProps,
            endAdornment: (
              <>
                {comLoading ? <CircularProgress size={16} /> : null}
                {rest.InputProps.endAdornment}
              </>
            )
          }
        }}
      />
    )
  }
)

export const ComOption = meme(
  ({
    option,
    manufacturer,
    ...props
  }: { option: string; manufacturer?: string } & React.HTMLAttributes<HTMLLIElement>) => (
    <li {...props} key={option}>
      <Box sx={{ width: '100%' }} title={option}>
        <Box
          sx={{
            fontSize: '0.85rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: '100%'
          }}
        >
          {option}
        </Box>
        {manufacturer && (
          <Box
            sx={{
              fontSize: '0.75rem',
              color: 'text.secondary',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              width: '100%'
            }}
          >
            {manufacturer}
          </Box>
        )}
      </Box>
    </li>
  )
)

export const BaudRateSelect = meme(
  ({
    value,
    onChange,
    disabled,
    testId = 'rtu-baudrate-select'
  }: {
    value: ModbusBaudRate
    onChange: (value: ModbusBaudRate) => void
    disabled?: boolean
    testId?: string
  }) => {
    const labelId = `${testId}-label`

    return (
      <FormControl size="small">
        <InputLabel id={labelId}>Baud Rate</InputLabel>
        <Select
          disabled={disabled}
          size="small"
          labelId={labelId}
          value={value}
          label="Baud Rate"
          onChange={(e) => onChange(e.target.value as ModbusBaudRate)}
          sx={{ width: 100 }}
          data-testid={testId}
        >
          {ModbusBaudRateSchema.options.map((v) => (
            <MenuItem key={`baud_rate_${v}`} value={v}>
              {v}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
)

const parityOptions = ['none', 'even', 'odd', 'mark', 'space'] as const

export const ParitySelect = meme(
  ({
    value,
    onChange,
    disabled,
    testId = 'rtu-parity-select'
  }: {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    testId?: string
  }) => {
    const labelId = `${testId}-label`

    return (
      <FormControl size="small">
        <InputLabel id={labelId}>Parity</InputLabel>
        <Select
          disabled={disabled}
          size="small"
          labelId={labelId}
          value={value}
          label="Parity"
          onChange={(e) => onChange(e.target.value)}
          sx={{ width: 85 }}
          data-testid={testId}
        >
          {parityOptions.map((option) => (
            <MenuItem key={`parity_${option}`} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
)

const databitsOptions = [8, 7, 6, 5] as const

export const DataBitsSelect = meme(
  ({
    value,
    onChange,
    disabled,
    testId = 'rtu-databits-select'
  }: {
    value: number
    onChange: (value: number) => void
    disabled?: boolean
    testId?: string
  }) => {
    const labelId = `${testId}-label`

    return (
      <FormControl size="small">
        <InputLabel id={labelId}>Data</InputLabel>
        <Select
          disabled={disabled}
          size="small"
          labelId={labelId}
          value={value}
          label="Data Bits"
          onChange={(e) => onChange(Number(e.target.value))}
          sx={{ width: 55 }}
          data-testid={testId}
        >
          {databitsOptions.map((option) => (
            <MenuItem key={`databits_${option}`} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
)

const stopBitsOptions = [1, 2] as const

export const StopBitsSelect = meme(
  ({
    value,
    onChange,
    disabled,
    testId = 'rtu-stopbits-select'
  }: {
    value: number
    onChange: (value: number) => void
    disabled?: boolean
    testId?: string
  }) => {
    const labelId = `${testId}-label`

    return (
      <FormControl size="small">
        <InputLabel id={labelId}>Stop</InputLabel>
        <Select
          disabled={disabled}
          size="small"
          labelId={labelId}
          value={value}
          label="Stop Bits"
          onChange={(e) => onChange(Number(e.target.value))}
          sx={{ width: 55 }}
          data-testid={testId}
        >
          {stopBitsOptions.map((option) => (
            <MenuItem key={`stopbits_${option}`} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
)

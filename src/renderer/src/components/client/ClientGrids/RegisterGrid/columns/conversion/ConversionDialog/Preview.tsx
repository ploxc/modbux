import Box from '@mui/material/Box'
import InputBase, { InputBaseComponentProps } from '@mui/material/InputBase'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useMinMaxInteger } from '@renderer/hooks'
import { DataType, wordOf } from '@shared'
import { ElementType, useState } from 'react'
import { applyConversion } from '../../convertedValue'
import { useRowAt } from '../../../useRowAt'
import { Draft, isNumber } from './draft'
import { NumberInput } from './NumberInput'

interface PreviewProps {
  draft: Draft
  dataType: DataType | undefined
  address: number
}

/** What the draft makes of a value typed in, and of the register's current value. */
const Preview = meme(({ draft, dataType, address }: PreviewProps) => {
  const [test, setTest] = useState('')
  // A raw value is what the data type can read: whole where it is an integer,
  // and clamped to its range.
  const { integer, min, max } = useMinMaxInteger(dataType ?? 'none')
  const row = useRowAt(address)
  const read = row && wordOf(row.words, dataType)
  const readText = read === undefined || read === '' ? undefined : String(read)

  // A draft that does not convert shows a dash here; why is said at the code.
  const resultOf = (value: string): string => {
    if (!isNumber(value)) return ''
    const result = applyConversion(value, dataType, draft)
    return typeof result === 'number' ? String(result) : '—'
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: 2, py: 1.5 }}>
      <Box sx={{ fontSize: 11, color: 'text.disabled' }}>Preview</Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '96px 16px minmax(0, 1fr)',
          alignItems: 'center',
          columnGap: 1,
          rowGap: 0.75,
          fontFamily: 'monospace',
          fontSize: 12.5
        }}
      >
        <InputBase
          value={test}
          placeholder="raw"
          inputComponent={NumberInput as unknown as ElementType<InputBaseComponentProps, 'input'>}
          inputProps={{
            'data-testid': 'conversion-test-input',
            'aria-label': 'A raw value to try',
            set: setTest,
            integer,
            min,
            max
          }}
          sx={(theme) => ({
            height: 28,
            px: 1,
            fontSize: 'inherit',
            fontFamily: 'inherit',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '4px'
          })}
        />
        <Box sx={{ color: 'text.disabled' }}>→</Box>
        <Box data-testid="conversion-test-result" sx={{ color: 'primary.light' }}>
          {resultOf(test)}
        </Box>
        {readText !== undefined && (
          <>
            <Box sx={{ pl: '9px', color: 'text.secondary' }}>{readText}</Box>
            <Box sx={{ color: 'text.disabled' }}>→</Box>
            <Box sx={{ color: 'primary.light' }}>
              {resultOf(readText)}
              <Box component="span" sx={{ ml: 1, color: 'text.disabled', fontSize: '0.7rem' }}>
                current value
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
})

export default Preview

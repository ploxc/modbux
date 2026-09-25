import Box from '@mui/material/Box'
import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData, RegisterDataWords } from '@shared'

const registerValueToString = (
  value: number | bigint
): { numberString: string; irrelevant: boolean } => {
  const numberString = value.toString(10)

  return { numberString, irrelevant: numberString === '0' }
}

/** The data types whose word is a number, which is what this column draws. */
type NumberWord = {
  [K in keyof RegisterDataWords]: RegisterDataWords[K] extends number | bigint ? K : never
}[keyof RegisterDataWords]

export const valueColumn = (
  key: NumberWord,
  width: number
): GridColDef<RegisterData, RegisterDataWords, RegisterDataWords> => ({
  type: 'number',
  field: `word_${key}`,
  headerName: key.toUpperCase(),
  width,
  renderCell: ({ row }): JSX.Element | null => {
    const value = row.words?.[key]
    if (value === undefined) return null

    const { numberString, irrelevant } = registerValueToString(value)

    return (
      <Box
        title={String(value)}
        sx={{
          opacity: irrelevant ? 0.25 : undefined,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis'
        }}
      >
        {numberString}
      </Box>
    )
  }
})

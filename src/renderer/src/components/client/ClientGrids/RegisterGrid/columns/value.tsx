import Box from '@mui/material/Box'
import { GridColDef } from '@mui/x-data-grid/models'
import { meme } from '@renderer/components/shared/inputs/meme'
import { RegisterData, RegisterDataWords } from '@shared'
import { useRowAt } from '../useRowAt'

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

interface ValueCellProps {
  address: number
  wordKey: NumberWord
}

const ValueCell = meme(({ address, wordKey }: ValueCellProps): JSX.Element | null => {
  const value = useRowAt(address)?.words?.[wordKey]
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
})

export const valueColumn = (
  key: NumberWord,
  width: number
): GridColDef<RegisterData, number | undefined> => ({
  type: 'number',
  field: `word_${key}`,
  headerName: key.toUpperCase(),
  width,
  // What the filter reads. The field names no key of the row, so without this
  // a word filter compared against nothing and matched no row. A 64-bit word
  // is compared as a number, which is exact up to 2^53.
  valueGetter: (_, row): number | undefined => {
    const word = row.words?.[key]
    return word === undefined ? undefined : Number(word)
  },
  renderCell: ({ row }) => <ValueCell address={row.id} wordKey={key} />
})

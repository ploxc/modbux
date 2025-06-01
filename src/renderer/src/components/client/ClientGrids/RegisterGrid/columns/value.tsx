import { Box } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid/models'
import { DataType, RegisterData, RegisterDataWords } from '@shared'

const registerValueToString = (
  value: number | bigint
): { numberString: string; irrelevant: boolean } => {
  let numberString: string = '0'
  numberString = value.toString(10)

  const irrelevant = numberString === '0'

  return { numberString, irrelevant }
}

export const valueColumn = (
  key: DataType,
  width: number,
  type?: GridColDef['type']
): GridColDef<RegisterData, RegisterDataWords, RegisterDataWords> => ({
  type: type || 'number',
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

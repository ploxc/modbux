import { GridColDef } from '@mui/x-data-grid/models'
import Box from '@mui/material/Box'
import { RegisterData } from '@shared'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useRowAt } from '../useRowAt'

interface WordLedDisplayProps {
  value: number | undefined
}

const WordLedDisplay = meme(({ value = 0 }: WordLedDisplayProps): JSX.Element => {
  const bits = value
    .toString(2)
    .padStart(16, '0')
    .split('')
    .map((b) => b === '1')

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        pb: 0.05
      }}
    >
      {[0, 1].map((row) => (
        <Box
          key={row}
          sx={{
            display: 'flex',
            gap: '2px',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          {bits.slice(row * 8, row * 8 + 8).map((on, i) => (
            <Box
              key={i}
              sx={(theme) => ({
                width: 7,
                aspectRatio: 1,
                borderRadius: '50%',
                backgroundColor: on ? theme.palette.primary.main : theme.palette.background.default
              })}
            />
          ))}
        </Box>
      ))}
    </Box>
  )
})

const BinaryCell = meme(
  ({ address }: { address: number }): JSX.Element => (
    <WordLedDisplay value={useRowAt(address)?.words?.['uint16']} />
  )
)

export const binaryColumn: GridColDef<RegisterData, string> = {
  field: 'bin',
  // A filter over a bit string answers nothing anyone asks.
  disableColumnMenu: true,
  headerName: 'BIN',
  width: 80,
  renderCell: ({ row }) => <BinaryCell address={row.id} />
}

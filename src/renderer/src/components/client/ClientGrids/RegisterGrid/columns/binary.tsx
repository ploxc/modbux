import { GridColDef } from '@mui/x-data-grid/models'
import Box from '@mui/material/Box'
import { RegisterData } from '@shared'
import { meme } from '@renderer/components/shared/inputs/meme'

interface Props {
  value: number
}

const WordLedDisplay = meme(({ value }: Props): JSX.Element => {
  // Zorg dat we exact 16 bits hebben
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
                backgroundColor: on ? theme.palette.primary.main : theme.palette.background.default // groen of grijs
              })}
            />
          ))}
        </Box>
      ))}
    </Box>
  )
})

export const binaryColumn: GridColDef<RegisterData, string> = {
  field: 'bin',
  headerName: 'BIN',
  width: 80,
  renderCell: ({ row }) => <WordLedDisplay value={row.words?.['uint16']} />
}

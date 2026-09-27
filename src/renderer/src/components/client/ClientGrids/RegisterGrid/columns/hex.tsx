import Box from '@mui/material/Box'
import { GridColDef } from '@mui/x-data-grid/models'
import { meme } from '@renderer/components/shared/inputs/meme'
import { RegisterData } from '@shared'
import { useRowAt } from '../useRowAt'

const HexCell = meme(({ address }: { address: number }): JSX.Element => {
  const hex = useRowAt(address)?.hex
  return (
    <Box
      sx={(theme) => ({
        fontFamily: 'monospace',
        color: theme.palette.primary.light
      })}
    >
      {hex?.toUpperCase()}
    </Box>
  )
})

export const hexColumn: GridColDef<RegisterData, string> = {
  field: 'hex',
  headerName: 'HEX',
  width: 50,
  renderCell: ({ row }) => <HexCell address={row.id} />
}

import Box from '@mui/material/Box'
import { GridColDef } from '@mui/x-data-grid/models'
import { meme } from '@renderer/components/shared/inputs/meme'
import { RegisterData } from '@shared'
import { useRowAt } from '../useRowAt'

const BitCell = meme(({ address }: { address: number }): JSX.Element => {
  const value = useRowAt(address)?.bit
  return (
    <Box
      sx={(theme) => ({
        background: value ? theme.palette.success.main : undefined,
        color: value ? theme.palette.success.contrastText : undefined,
        fontWeight: value ? 'bold' : undefined,
        opacity: value ? 1 : 0.5,
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      })}
    >
      {value ? '1' : '0'}
    </Box>
  )
})

export const bitColumn: GridColDef<RegisterData, boolean, boolean> = {
  field: 'bit',
  filterable: false,
  type: 'boolean',
  headerName: 'Bit',
  width: 80,
  renderCell: ({ row }) => <BitCell address={row.id} />
}

import Box from '@mui/material/Box'
import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData } from '@shared'

export const bitColumn: GridColDef<RegisterData, boolean, boolean> = {
  field: 'bit',
  type: 'boolean',
  headerName: 'Bit',
  width: 80,
  renderCell: ({ value }) => (
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
      {value ? 'TRUE' : 'FALSE'}
    </Box>
  )
}

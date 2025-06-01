import Box from '@mui/material/Box'
import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData } from '@shared'

export const hexColumn: GridColDef<RegisterData, string> = {
  field: 'hex',
  sortable: false,
  headerName: 'HEX',
  width: 50,
  renderCell: ({ value }) => (
    <Box
      sx={(theme) => ({
        fontFamily: 'monospace',
        color: theme.palette.primary.light
      })}
    >
      {value?.toUpperCase()}
    </Box>
  )
}

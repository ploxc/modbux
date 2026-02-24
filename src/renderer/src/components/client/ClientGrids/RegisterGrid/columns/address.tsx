import { Box } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterData } from '@shared'

export const addressColumn = (addressBase: string): GridColDef<RegisterData, number> => ({
  field: 'id',
  sortable: false,
  hideable: false,
  headerName: 'Addr.',
  width: 60,
  renderCell: ({ value }) => (
    <Box sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
      {(value ?? 0) + Number(addressBase)}
    </Box>
  )
})

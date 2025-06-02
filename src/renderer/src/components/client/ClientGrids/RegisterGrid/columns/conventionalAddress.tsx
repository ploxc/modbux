import Box from '@mui/material/Box'
import { GridColDef } from '@mui/x-data-grid/models'
import { getConventionalAddress, RegisterData, RegisterType } from '@shared'

export const conventionalAddresColumn = (
  type: RegisterType,
  addressBase: string,
  showConventionalAddress: boolean
): GridColDef<RegisterData, number> => ({
  field: 'conventionalAddress',
  sortable: false,
  headerName: 'Conv.',
  width: 60,
  renderCell: ({ row }): JSX.Element => {
    const value = showConventionalAddress
      ? getConventionalAddress(type, String(row.id), addressBase)
      : addressBase === '1'
        ? row.id + Number(addressBase)
        : ''

    return (
      <Box
        sx={(theme) => ({
          fontFamily: 'monospace',
          color: theme.palette.primary.light
        })}
      >
        {value}
      </Box>
    )
  }
})

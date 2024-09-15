import { Paper } from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { useRootZustand } from '@renderer/context/root.zustand'
import useRegisterGridColumns from './_columns'

const RegisterGridContent = () => {
  const registerData = useRootZustand((z) => z.registerData)
  const columns = useRegisterGridColumns()

  return (
    <DataGrid
      rows={registerData}
      columns={columns}
      autoHeight={false}
      density="compact"
      checkboxSelection
      rowHeight={40}
      columnHeaderHeight={48}
      hideFooterPagination
      sx={{
        '& .MuiDataGrid-virtualScrollerContent': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36
        }
      }}
      localeText={{
        noRowsLabel: 'Connect to Modbus server to see registers'
      }}
    />
  )
}

const RegisterGrid = () => {
  return (
    <Paper sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0 }}>
      <RegisterGridContent />
    </Paper>
  )
}
export default RegisterGrid

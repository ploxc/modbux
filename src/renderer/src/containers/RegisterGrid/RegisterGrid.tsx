import { Paper } from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { useRootZustand } from '@renderer/context/root.zustand'
import useRegisterGridColumns from './_columns'
import RegisterGridToolbar from './RegisterGridToolbar/RegisterGridToolbar'

const RegisterGridContent = () => {
  const registerData = useRootZustand((z) => z.registerData)
  const columns = useRegisterGridColumns()

  return (
    <DataGrid
      rows={registerData}
      columns={columns}
      autoHeight={false}
      density="compact"
      rowHeight={40}
      columnHeaderHeight={48}
      hideFooterPagination
      sx={(theme) => ({
        '& .MuiDataGrid-virtualScrollerContent': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36
        },
        '& .MuiDataGrid-toolbarContainer': {
          background: theme.palette.background.default
        }
      })}
      localeText={{
        noRowsLabel: 'Connect and read to see registers'
      }}
      slots={{ toolbar: RegisterGridToolbar }}
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

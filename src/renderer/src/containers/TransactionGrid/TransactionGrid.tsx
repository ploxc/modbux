import { Box, Button, Paper } from '@mui/material'
import {
  DataGrid,
  GridFooterContainer,
  GridPagination,
  useGridApiContext,
  useGridApiRef
} from '@mui/x-data-grid'
import { useRootZustand } from '@renderer/context/root.zustand'
import useTransactionGridColumns from './_columns'
import { DateTime } from 'luxon'

const ExportButton = () => {
  const api = useGridApiContext()
  return (
    <Button
      size="small"
      variant="outlined"
      onClick={() =>
        api.current.exportDataAsCsv({
          fileName: `transaction_log_${DateTime.now().toFormat('yyyymmdd_HHmmss')}`
        })
      }
    >
      Export
    </Button>
  )
}

const ClearButton = () => {
  const clear = useRootZustand((z) => z.clearTransactions)
  return (
    <Button size="small" variant="outlined" onClick={clear}>
      Clear
    </Button>
  )
}

const CustomFooter = () => {
  return (
    <GridFooterContainer sx={{ px: 0.5, gap:0.5 }}>
      <Box sx={{ flex: 1 }} />
      <GridPagination />
      <ExportButton />
      <ClearButton />
    </GridFooterContainer>
  )
}

const TransactionGridContent = () => {
  const api = useGridApiRef()

  const transactions = useRootZustand((z) => z.transactions)
  const columns = useTransactionGridColumns()

  return (
    <DataGrid
      apiRef={api}
      rows={transactions}
      columns={columns}
      autoHeight={false}
      density="compact"
      rowHeight={40}
      columnHeaderHeight={48}
      initialState={{ pagination: { paginationModel: { pageSize: 20, page: 0 } } }}
      getRowHeight={() => 'auto'}
      sx={(theme) => ({
        '& .MuiDataGrid-virtualScrollerContent': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36,
          overflow: 'hidden'
        },
        '& .MuiDataGrid-toolbarContainer': {
          background: theme.palette.background.default
        }
      })}
      localeText={{
        noRowsLabel: 'No transactions logged yet'
      }}
      slots={{ footer: CustomFooter }}
    />
  )
}

const TransactionGrid = () => {
  return (
    <Paper sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0, height: '100%' }}>
      <TransactionGridContent />
    </Paper>
  )
}

export default TransactionGrid

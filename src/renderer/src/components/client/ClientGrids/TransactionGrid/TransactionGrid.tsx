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
import { meme } from '@renderer/components/shared/inputs/meme'

//
//
//
//
// Log export button exports the transaction log as a CSV file
const ExportButton = (): JSX.Element => {
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

//
//
//
//
// Clears the transaction log
const ClearButton = (): JSX.Element => {
  const clear = useRootZustand((z) => z.clearTransactions)
  return (
    <Button size="small" variant="outlined" onClick={clear}>
      Clear
    </Button>
  )
}

//
//
//
//
// Custom footer with export and clear buttons
const CustomFooter = (): JSX.Element => {
  return (
    <GridFooterContainer sx={{ px: 0.5, gap: 0.5 }}>
      <Box sx={{ flex: 1 }} />
      <GridPagination />
      <ExportButton />
      <ClearButton />
    </GridFooterContainer>
  )
}

//
//
//
//
// Datagrid
const TransactionGridContent = meme(() => {
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
})

//
//
//
//
// DataGrid paper
const TransactionGrid = (): JSX.Element => {
  return (
    <Paper sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0, height: '100%' }}>
      <TransactionGridContent />
    </Paper>
  )
}

export default TransactionGrid

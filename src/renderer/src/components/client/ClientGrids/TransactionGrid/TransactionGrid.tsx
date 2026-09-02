import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import { useGridApiContext, useGridApiRef } from '@mui/x-data-grid'
import { DataGrid } from '@mui/x-data-grid/DataGrid'
import { GridFooterContainer, GridPagination } from '@mui/x-data-grid/components'
import { useClientZustand } from '@renderer/context/client.zustand'
import useTransactionGridColumns from './_columns'
import { DateTime } from 'luxon'
import { meme } from '@renderer/components/shared/inputs/meme'

//
//
//
//
// Log export button exports the transaction log as a CSV file
const ExportButton = meme((): JSX.Element => {
  const api = useGridApiContext()

  return (
    <Button
      data-testid="transaction-export-btn"
      size="small"
      variant="outlined"
      onClick={() =>
        api.current.exportDataAsCsv({
          fileName: `transaction_log_${DateTime.now().toFormat('yyyyMMdd_HHmmss')}`
        })
      }
    >
      Export
    </Button>
  )
})

//
//
//
//
// Clears the transaction log
const ClearButton = meme((): JSX.Element => {
  const clear = useClientZustand((z) => z.clearTransactions)
  return (
    <Button data-testid="transaction-clear-btn" size="small" variant="outlined" onClick={clear}>
      Clear
    </Button>
  )
})

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

  const transactions = useClientZustand((z) => z.transactions)
  const columns = useTransactionGridColumns()

  return (
    <DataGrid
      apiRef={api}
      rows={transactions}
      columns={columns}
      disableVirtualization={window.api.isE2e}
      autoHeight={false}
      density="compact"
      rowHeight={40}
      columnHeaderHeight={48}
      initialState={{ pagination: { paginationModel: { pageSize: 20, page: 0 } } }}
      getRowHeight={() => 'auto'}
      sx={{
        // x-data-grid v8 moved the column headers inside the virtual scroller
        // for column virtualisation, so scoping monospace to the scroller now
        // catches the headers too. Target the data rows instead.
        '& .MuiDataGrid-row': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36,
          overflow: 'hidden'
        }
      }}
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
const TransactionGrid = meme((): JSX.Element => {
  return (
    <Paper
      data-testid="transaction-log-panel"
      sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0, height: '100%' }}
    >
      <TransactionGridContent />
    </Paper>
  )
})

export default TransactionGrid

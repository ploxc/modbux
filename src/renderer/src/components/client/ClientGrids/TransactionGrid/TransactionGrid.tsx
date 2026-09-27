import ExpandLess from '@mui/icons-material/ExpandLess'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Paper from '@mui/material/Paper'
import { panelShadow } from '@renderer/theme'
import { useGridApiContext, useGridApiRef } from '@mui/x-data-grid'
import { DataGrid } from '@mui/x-data-grid/DataGrid'
import { GridFooterContainer, GridPagination } from '@mui/x-data-grid/components'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import useTransactionGridColumns from './columns'
import { DateTime } from 'luxon'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useMemo } from 'react'
import { useClientZustand, selectedClientUuid } from '@renderer/context/client.zustand'

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
  const handleClick = useCallback((): void => {
    useLiveZustand.getState().clearTransactions(selectedClientUuid())
  }, [])

  return (
    <Button
      data-testid="transaction-clear-btn"
      size="small"
      variant="text"
      color="inherit"
      onClick={handleClick}
    >
      Clear
    </Button>
  )
})

//
//
//
//
// Custom footer with export and clear buttons
const CustomFooter = meme((): JSX.Element => {
  return (
    <GridFooterContainer sx={{ px: 0.5, gap: 0.5 }}>
      <Box sx={{ flex: 1 }} />
      <GridPagination />
      <ExportButton />
    </GridFooterContainer>
  )
})

//
//
//
//
// Datagrid
const TransactionGridContent = meme(() => {
  const api = useGridApiRef()

  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const transactions = useLiveZustand((z) => dataOf(z, selectedUuid).transactions)
  const columns = useTransactionGridColumns()

  return (
    <DataGrid
      apiRef={api}
      rows={transactions}
      columns={columns}
      autoHeight={false}
      density="compact"
      columnHeaderHeight={48}
      getRowHeight={() => 'auto'}
      sx={{
        // x-data-grid v8 moved the column headers inside the virtual scroller
        // for column virtualisation, so scoping monospace to the scroller now
        // catches the headers too. Target the data rows instead.
        '& .MuiDataGrid-row': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
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
// Status line
/**
 * What the log holds, and the switch that opens it. Closed, it is all of the
 * log that is left on screen.
 */
const StatusLine = meme(({ open }: { open: boolean }): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const transactions = useLiveZustand((z) => dataOf(z, selectedUuid).transactions)
  const last = useLiveZustand((z) => dataOf(z, selectedUuid).lastSuccessfulTransactionMillis)
  const errors = useMemo(
    () => transactions.filter((transaction) => transaction.errorMessage !== undefined).length,
    [transactions]
  )

  const handleToggle = useCallback((): void => {
    const layoutZustand = useLayoutZustand.getState()
    layoutZustand.toggleShowLog()
  }, [])

  return (
    <Box
      sx={{
        height: 30,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        pl: 0.5,
        pr: 0.75,
        fontSize: 12,
        color: 'text.secondary',
        '& b': { color: 'text.primary', fontWeight: 500 }
      }}
    >
      <ButtonBase
        data-testid="transaction-log-toggle"
        aria-expanded={open}
        onClick={handleToggle}
        sx={{
          height: 26,
          pl: 0.5,
          pr: 1,
          gap: 0.75,
          borderRadius: 1,
          fontSize: 12.5,
          color: 'text.primary'
        }}
      >
        <ExpandLess sx={{ fontSize: 16, transform: open ? 'rotate(180deg)' : 'none' }} />
        Transaction log
        <Box
          component="span"
          sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary' }}
        >
          {transactions.length}
        </Box>
      </ButtonBase>
      <span>
        Last <b>{last ? DateTime.fromMillis(last).toFormat('HH:mm:ss.SSS') : 'n/a'}</b>
      </span>
      <span>
        Errors{' '}
        <Box component="b" sx={{ '&&': { color: errors > 0 ? 'error.light' : undefined } }}>
          {errors}
        </Box>
      </span>
      <Box sx={{ flex: 1 }} />
      {open && <ClearButton />}
    </Box>
  )
})

//
//
//
//
// Log card
/**
 * The transaction log as its own card under the grid. Open, the grid sits
 * under its status line; closed, only the status line is left.
 */
const TransactionGrid = meme(({ open }: { open: boolean }): JSX.Element => {
  return (
    <Paper
      data-testid="transaction-log"
      sx={(theme) => ({
        height: open ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: theme.palette.background.paper,
        borderRadius: '8px',
        boxShadow: panelShadow
      })}
    >
      <StatusLine open={open} />
      {open && (
        <Box data-testid="transaction-log-panel" sx={{ flexGrow: 1, minHeight: 0, p: 0.5 }}>
          <TransactionGridContent />
        </Box>
      )}
    </Paper>
  )
})

export default TransactionGrid

import Box from '@mui/material/Box'
import { GridColDef } from '@mui/x-data-grid/models'
import { Transaction } from '@shared'
import { DateTime } from 'luxon'
import { useMemo } from 'react'
import ClampedCell from './ClampedCell'

const timestampColumn: GridColDef<Transaction, number, string> = {
  field: 'timestamp',
  headerName: 'Timestamp',
  hideable: false,
  width: 190,
  sortable: true,
  disableColumnMenu: true,
  valueFormatter: (v: number) => DateTime.fromMillis(v).toFormat('yyyy-MM-dd HH:mm:ss.SSS')
}

const unitIdColumn: GridColDef<Transaction, number> = {
  field: 'unitId',
  headerName: 'ID',
  sortable: false,
  disableColumnMenu: true,
  minWidth: 35,
  maxWidth: 35
}

const addressColumn: GridColDef<Transaction, number> = {
  field: 'address',
  headerName: 'Addr',
  sortable: false,
  disableColumnMenu: true,
  minWidth: 60,
  maxWidth: 60
}

const functionColumn: GridColDef<Transaction, number> = {
  field: 'code',
  headerName: 'Fn',
  sortable: false,
  disableColumnMenu: true,
  minWidth: 35,
  maxWidth: 35
}

const roundTripColumn: GridColDef<Transaction, number, string> = {
  field: 'roundTripMillis',
  headerName: 'RTT',
  sortable: false,
  disableColumnMenu: true,
  minWidth: 70,
  maxWidth: 70,
  valueFormatter: (v: number) => `${v} ms`
}

const requestColumn: GridColDef<Transaction, string, string> = {
  field: 'request',
  headerName: 'Request',
  width: 200,
  sortable: false,
  disableColumnMenu: true,
  renderCell: ({ value, row }) => (
    <ClampedCell id={row.id} field="request" line={value} full={value} more={false} />
  )
}

const responseColumn: GridColDef<Transaction, string[], string[]> = {
  field: 'responses',
  flex: 3,
  minWidth: 260,
  sortable: false,
  disableColumnMenu: true,
  // Several responses show the first on one line, and all of them opened.
  renderCell: ({ value = [], row }) => (
    <ClampedCell
      id={row.id}
      field="response"
      line={value[0] === undefined ? '' : `1: ${value[0]}`}
      full={value.map((response, i) => (
        <Box key={`response_${row.id}_${i}`} sx={{ display: 'flex', gap: 2 }}>
          <span>{i + 1}:</span>
          <span>{response}</span>
        </Box>
      ))}
      more={value.length > 1}
    />
  )
}

const errorMessageColumn: GridColDef<Transaction, string> = {
  field: 'errorMessage',
  headerName: 'Error',
  flex: 2,
  minWidth: 120,
  sortable: false,
  disableColumnMenu: true,
  valueFormatter: (v) => v ?? '-'
}

const useTransactionGridColumns = (): GridColDef<Transaction>[] => {
  return useMemo(() => {
    return [
      timestampColumn,
      unitIdColumn,
      addressColumn,
      functionColumn,
      roundTripColumn,
      requestColumn,
      responseColumn,
      errorMessageColumn
    ]
  }, [])
}

export default useTransactionGridColumns
